const https = require('https');
const http = require('http');

function makeRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { reject(new Error('Bad JSON: ' + data)); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-ebay-client-id,x-ebay-client-secret,x-ebay-action,x-ebay-token,x-ebay-query,x-ebay-limit,x-ebay-sort,x-ebay-condition,x-ebay-maxprice');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const clientId = req.headers['x-ebay-client-id'];
  const clientSecret = req.headers['x-ebay-client-secret'];
  const action = req.headers['x-ebay-action'];

  if (!clientId || !clientSecret) {
    res.writeHead(400, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ error: 'Missing credentials' }));
    return;
  }

  if (action === 'token') {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope';
    try {
      const result = await makeRequest({
        hostname: 'api.ebay.com',
        path: '/identity/v1/oauth2/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
          'Content-Length': Buffer.byteLength(body)
        }
      }, body);
      res.writeHead(result.status, {'Content-Type':'application/json'});
      res.end(JSON.stringify(result.body));
    } catch(e) {
      res.writeHead(500, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ error: 'Token failed', detail: e.message }));
    }
    return;
  }

  if (action === 'search') {
    const token = req.headers['x-ebay-token'];
    const query = req.headers['x-ebay-query'];
    const limit = req.headers['x-ebay-limit'] || '12';
    const condition = req.headers['x-ebay-condition'] || '';
    const sort = req.headers['x-ebay-sort'] || 'BestMatch';
    const maxPrice = req.headers['x-ebay-maxprice'] || '';

    if (!token || !query) {
      res.writeHead(400, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ error: 'Missing token or query' }));
      return;
    }

    let path = `/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    if (condition) path += `&filter=conditionIds%3A{${condition}}`;
    if (maxPrice) path += `&filter=price%3A%5B0..${maxPrice}%5D%2CpriceCurrency%3AUSD`;
    if (sort) path += `&sort=${sort}`;

    try {
      const result = await makeRequest({
        hostname: 'api.ebay.com',
        path: path,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        }
      });
      res.writeHead(result.status, {'Content-Type':'application/json'});
      res.end(JSON.stringify(result.body));
    } catch(e) {
      res.writeHead(500, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ error: 'Search failed', detail: e.message }));
    }
    return;
  }

  res.writeHead(400, {'Content-Type':'application/json'});
  res.end(JSON.stringify({ error: 'Unknown action' }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
