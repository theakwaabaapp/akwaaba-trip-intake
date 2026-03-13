export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, days, dates, group, regions, style, vibe, pairing } = req.body;

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
      'Grounded & Genuine': '$50-$150 / day',
      'Comfort & Culture': '$150-$350 / day',
      'Soft Life & Premium': '$400-$800 / day',
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

Generate evocative, exciting day titles (3-6 words each). Make them feel like a travel magazine - aspirational and specific to Ghana.

Examples of great day titles:
- "Arrival & The Golden Mile"
- "Castle Echoes & Canopy Walk"
- "Volta River Drift & Dusk"
- "Kumasi Market & Kente Masters"

Return ONLY valid JSON:
{
  "dayTitles": ["title1", "title2", ...],
  "regions": "City1, City2, City3",
  "tripTheme": "short evocative phrase (max 5 words)"
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
        max_tokens: 600
      })
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      throw new Error(`OpenAI: ${openaiRes.status} ${errText.slice(0, 200)}`);
    }

    const openaiData = await openaiRes.json();
    const result = JSON.parse(openaiData.choices[0].message.content);

    const dayTitles = (result.dayTitles || []).slice(0, numDays);
    while (dayTitles.length < numDays) dayTitles.push(`Day ${dayTitles.length + 1}`);

    const params = new URLSearchParams({
      name: name || 'Traveler',
      days: String(numDays),
      dates: dates || '',
      style: tier,
      price: priceMap[tier] || '$150-$350 / day',
      regions: (result.regions || regionList).replace(/,\s*/g, ','),
      group: group || 'solo',
      vibe: Array.isArray(vibe) ? (vibe[0] || 'culture') : (vibe || 'culture'),
      plan_unlocked: '1'
    });

    dayTitles.forEach((title, i) => params.set(`d${i + 1}`, title));

    return res.status(200).json({
      redirectUrl: `https://akwaaba-trip-planner.vercel.app/?${params.toString()}`,
      tripTheme: result.tripTheme || ''
    });

  } catch (error) {
    console.error('Generate error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
