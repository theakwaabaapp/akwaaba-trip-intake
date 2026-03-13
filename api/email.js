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

    // Build custom fields using Flodesk's camelCase keys
    const custom_fields = {
      source: 'Ghana Trip Planner',
      tripStyle: style || '',
      tripDays: String(days || ''),
      tripDates: dates || '',
      regions: Array.isArray(regions) ? regions.join(' • ') : (regions || ''),
      tripVibe: vibe || '',
    };

    // Day titles (day1–day7)
    if (Array.isArray(dayTitles)) {
      dayTitles.slice(0, 7).forEach((title, i) => {
        custom_fields[`day${i + 1}`] = title || '';
      });
    }

    // Create / update subscriber AND add to segment in one call
    const subRes = await fetch('https://api.flodesk.com/v1/subscribers', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email,
        first_name: name,
        status: 'active',
        segment_ids: [segmentId],
        custom_fields
      })
    });

    const subData = await subRes.json();

    if (!subRes.ok) {
      console.error('Flodesk error:', JSON.stringify(subData));
      return res.status(200).json({ success: false, error: subData.message });
    }

    return res.status(200).json({ success: true, segments: subData.segments?.length });

  } catch (error) {
    console.error('Email API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
