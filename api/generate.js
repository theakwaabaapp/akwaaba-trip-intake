export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, days, dates, group, regions, style, vibe } = req.body;

    // Fetch Google Sheets CSV
    let properties = [];
    try {
      const csvRes = await fetch(
        'https://docs.google.com/spreadsheets/d/1l3x6aefxyKqoqofCPd4rPnBuC2KCnr0L4gjiDsX3Jj4/export?format=csv',
        { redirect: 'follow' }
      );
      const csv = await csvRes.text();
      const lines = csv.trim().split('\n').slice(1);
      properties = lines.map(line => {
        const parts = line.split(',');
        return {
          name: (parts[1] || '').replace(/"/g, '').trim(),
          region: (parts[2] || '').replace(/"/g, '').trim(),
          location: (parts[3] || '').replace(/"/g, '').trim(),
          tier: (parts[4] || '').replace(/"/g, '').trim(),
        };
      }).filter(p => p.name);
    } catch (e) {
      console.error('Sheet fetch failed:', e.message);
    }

    const tierMap = {
      'grounded': 'Grounded & Genuine',
      'comfort': 'Comfort & Culture',
      'soft-life': 'Soft Life & Premium',
    };
    const tier = tierMap[style] || 'Comfort & Culture';

    const priceMap = {
      'Grounded & Genuine': 'from $250 / day',
      'Comfort & Culture': 'from $350 / day',
      'Soft Life & Premium': 'from $450 / day',
    };

    const selectedRegions = Array.isArray(regions) ? regions : [];
    const filtered = properties.filter(p =>
      selectedRegions.some(r => p.region.toLowerCase().includes(r.toLowerCase())) &&
      p.tier.includes(tier.split(' ')[0])
    );
    const pool = filtered.length >= 5 ? filtered : properties.slice(0, 20);
    const propList = pool.slice(0, 15).map(p => `- ${p.name} (${p.location}, ${p.region})`).join('\n');

    const numDays = Math.max(3, Math.min(14, parseInt(days) || 5));
    const vibeList = Array.isArray(vibe) ? vibe.join(', ') : (vibe || 'culture');
    const regionList = selectedRegions.join(', ') || 'Greater Accra';

    const prompt = `You are an expert Ghana travel planner for Akwaaba, a premium AI-powered travel app.

Create a ${numDays}-day Ghana itinerary for ${name || 'a traveler'}.

Details:
- Dates: ${dates}
- Group: ${group}
- Regions: ${regionList}
- Travel style: ${tier}
- Interests: ${vibeList}

Curated properties available:
${propList}

Rules:
- Each day MUST have exactly 4 activities (no fewer)
- Activity icons: single emoji, specific to the activity type
- Activity names: 3-5 words, evocative and specific to Ghana
- Activity descriptions: max 7 words, sensory and exciting
- Day titles: 3-6 words, travel magazine style, specific to Ghana
- Location: real Ghana city or area per day

Return ONLY valid JSON:
{
  "tripTheme": "short evocative phrase (max 5 words)",
  "regions": "City1, City2, City3",
  "days": [
    {
      "title": "Day Title Here",
      "location": "Accra",
      "activities": [
        {"icon": "🤝", "name": "Activity Name", "desc": "Short vivid description"},
        {"icon": "🍲", "name": "Activity Name", "desc": "Short vivid description"},
        {"icon": "🎵", "name": "Activity Name", "desc": "Short vivid description"},
        {"icon": "🌅", "name": "Activity Name", "desc": "Short vivid description"}
      ]
    }
  ]
}`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.85,
        max_tokens: 3000
      })
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      throw new Error(`OpenAI: ${openaiRes.status} ${errText.slice(0, 200)}`);
    }

    const openaiData = await openaiRes.json();
    const result = JSON.parse(openaiData.choices[0].message.content);

    const resultDays = (result.days || []).slice(0, numDays);
    while (resultDays.length < numDays) {
      resultDays.push({ title: `Day ${resultDays.length + 1}`, location: regionList, activities: [] });
    }

    const params = new URLSearchParams({
      name: name || 'Traveler',
      days: String(numDays),
      dates: dates || '',
      style: tier,
      price: priceMap[tier] || 'from $350 / day',
      regions: (result.regions || regionList).replace(/,\s*/g, ','),
      group: group || 'solo',
      vibe: Array.isArray(vibe) ? (vibe[0] || 'culture') : (vibe || 'culture'),
      plan_unlocked: '1'
    });

    resultDays.forEach((day, i) => {
      params.set(`d${i + 1}`, day.title || `Day ${i + 1}`);
      if (day.activities && day.activities.length > 0) {
        const actStr = day.activities.map(a => `${a.icon || '📍'}~${a.name || 'Activity'}~${a.desc || ''}`).join('|');
        params.set(`d${i + 1}a`, actStr);
      }
    });

    return res.status(200).json({
      redirectUrl: `/plan/?${params.toString()}`,
      tripTheme: result.tripTheme || '',
      days: numDays
    });

  } catch (error) {
    console.error('Generate error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
