export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, name, days, dates, style, regions, vibe, dayTitles } = req.body;

    if (!email || !name) return res.status(400).json({ error: 'email and name required' });

    const apiKey = process.env.FLODESK_API_KEY;
    const segmentId = process.env.FLODESK_SEGMENT_ID;
    const auth = Buffer.from(apiKey + ':').toString('base64');
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
      'User-Agent': 'AkwaabaApp/1.0'
    };

    // Build custom fields
    const custom_fields = {
      source: 'Ghana Trip Planner',
      trip_style: style || '',
      trip_days: String(days || ''),
      trip_dates: dates || '',
      regions: Array.isArray(regions) ? regions.join(' • ') : (regions || ''),
      trip_vibe: vibe || '',
    };

    // Add day titles as custom fields
    if (Array.isArray(dayTitles)) {
      dayTitles.slice(0, 10).forEach((title, i) => {
        custom_fields[`day_${i + 1}`] = title || '';
      });
    }

    // 1. Create / update subscriber
    const subRes = await fetch('https://api.flodesk.com/v1/subscribers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email,
        first_name: name,
        custom_fields,
        status: 'active'
      })
    });

    if (!subRes.ok) {
      const err = await subRes.text();
      console.error('Flodesk subscriber error:', err);
      // Don't block — still try segment add
    }

    // 2. Add to "Ghana Trip Planner" segment → triggers the workflow
    const segRes = await fetch(
      `https://api.flodesk.com/v1/subscribers/${encodeURIComponent(email)}/segments`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ segment_ids: [segmentId] })
      }
    );

    if (!segRes.ok) {
      const err = await segRes.text();
      console.error('Flodesk segment error:', err);
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Email API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
