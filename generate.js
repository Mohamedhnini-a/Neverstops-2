const fs = require('fs/promises');

const sourceUrls = [
  "https://github.com/Mohamedhnini-a/testeur-2/raw/refs/heads/main/working_configs.txt",
  "https://raw.githubusercontent.com/MohammadBahemmat/V2ray-Collector/main/all_servers.txt",
  "https://raw.githubusercontent.com/miladtahanian/Config-Collector/main/mixed_iran.txt",
  "https://raw.githubusercontent.com/mohammadaz2/v2rayConfigsForYou/main/configs.txt",
  "https://raw.githubusercontent.com/MahanKenway/Freedom-V2Ray/main/configs/mix.txt",
  "https://raw.githubusercontent.com/Kolandone/v2raycollector/main/config.txt",
  "https://raw.githubusercontent.com/Farid-Karimi/Config-Collector/main/mixed_iran.txt",
  "https://github.com/miladtahanian/Config-Collector/raw/refs/heads/main/mixed_iran.txt",
  "https://raw.githubusercontent.com/hamedcode/port-based-v2ray-configs/main/detailed/vless/443.txt",
  "https://raw.githubusercontent.com/hamedcode/port-based-v2ray-configs/main/detailed/vmess/443.txt",
  "https://raw.githubusercontent.com/hamedcode/port-based-v2ray-configs/main/detailed/trojan/443.txt",
  
  
];

const FREE_IP = "www.getlucky.com";
const FETCH_TIMEOUT_MS = 30_000;
const CONCURRENCY_LIMIT = 30;

// ============================================================
// Bug 5: Timeout helper (with fallback for older Node versions)
// ============================================================
function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

// ============================================================
// Bug 4: Printable-ratio check to avoid Base64 false positives
// ============================================================
function isPrintableText(text) {
  if (!text) return false;
  // strip ASCII control chars (keeping \t \n \r)
  const cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned.length / text.length > 0.9;
}

function decodeIfBase64(text) {
  try {
    const cleaned = text.trim().replace(/\s+/g, '');
    const normalized = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = Buffer.from(padded, 'base64').toString('utf8');

    if (!isPrintableText(decoded)) return text;

    if (
      decoded.includes('vless://') ||
      decoded.includes('trojan://') ||
      decoded.includes('vmess://')
    ) {
      return decoded;
    }
  } catch (_) {}

  return text;
}

function b64DecodeUtf8(b64) {
  try {
    b64 = b64.trim().replace(/\s/g, '');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function b64EncodeUtf8(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

// ============================================================
// Bug 6: Batch fetching with concurrency limit
// ============================================================
async function fetchWithLimit(urls, limit) {
  const results = [];
  for (let i = 0; i < urls.length; i += limit) {
    const batch = urls.slice(i, i + limit);
    const batchResults = await Promise.allSettled(
      batch.map((url) =>
        fetch(url, {
          headers: { 'user-agent': 'Mozilla/5.0' },
          signal: timeoutSignal(FETCH_TIMEOUT_MS),
        })
          .then((res) => {
            // Bug 8: log failures with status
            if (!res.ok) {
              console.warn(`[FAIL ${res.status}] ${url}`);
              return '';
            }
            return res.text();
          })
          .catch((err) => {
            // Bug 8: log network errors
            console.warn(`[ERR] ${url} — ${err?.message ?? String(err)}`);
            return '';
          })
      )
    );
    results.push(...batchResults);
  }
  return results;
}

async function main() {
  const results = await fetchWithLimit(sourceUrls, CONCURRENCY_LIMIT);

  const texts = results
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value);

  if (texts.length === 0) {
    console.error('⚠️ All sources failed to fetch.');
  }

  const filteredConfigs = [];
  const seenConfigs = new Set();

  for (const text of texts) {
    let decodedText = text;

    if (
      !text.includes('vless://') &&
      !text.includes('trojan://') &&
      !text.includes('vmess://')
    ) {
      decodedText = decodeIfBase64(text);
    }

    const lines = decodedText.split(/\r?\n/);

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // ==========================================
      // 1. VMess
      // ==========================================
      if (line.startsWith('vmess://')) {
        try {
          const cleanLine = line.split('#')[0];
          const b64 = cleanLine.slice(8).trim();
          const jsonStr = b64DecodeUtf8(b64);
          if (!jsonStr) continue;

          const config = JSON.parse(jsonStr);

          // Bug 7: parseInt instead of String() comparison
          if (
            String(config.net || '').toLowerCase() !== 'ws' ||
            String(config.tls || '').toLowerCase() !== 'tls' ||
            parseInt(config.port, 10) !== 443
          ) {
            continue;
          }

          // Bug 2: fallback host/sni to original server (add)
          const server = String(config.add || '').toLowerCase().trim();
          if (!server) continue;

          const host = String(config.host || config.sni || server)
            .toLowerCase()
            .trim();
          const sni = String(config.sni || host || server)
            .toLowerCase()
            .trim();

          // Bug 3: include path, aid, scy in signature
          const path = String(config.path || '/');
          const aid = config.aid || 0;
          const scy = config.scy || 'auto';
          const signature = `vmess|${config.id}|${host}|${sni}|${path}|${aid}|${scy}`;
          if (seenConfigs.has(signature)) continue;
          seenConfigs.add(signature);

          // Domain-fronting rewrite
          config.add = FREE_IP;
          config.host = host;
          config.sni = sni;

          filteredConfigs.push('vmess://' + b64EncodeUtf8(JSON.stringify(config)));
        } catch (_) {}
        continue;
      }

      // ==========================================
      // 2. VLESS / Trojan
      // ==========================================
      const cleanLine = line.split('#')[0].trim();
      if (
        !cleanLine.startsWith('vless://') &&
        !cleanLine.startsWith('trojan://')
      ) {
        continue;
      }

      try {
        const url = new URL(cleanLine);
        const protocol = url.protocol.replace(':', '').toLowerCase();
        // Treat empty port as 443 (default for vless/trojan)
        const port = url.port === '' ? 443 : parseInt(url.port, 10);

        if (
          (protocol !== 'vless' && protocol !== 'trojan') ||
          url.searchParams.get('type') !== 'ws' ||
          url.searchParams.get('security') !== 'tls' ||
          port !== 443
        ) {
          continue;
        }

        // Bug 2: fallback host/sni to hostname
        const hostname = url.hostname.toLowerCase();
        const host = (url.searchParams.get('host') || hostname).toLowerCase();
        const sni = (url.searchParams.get('sni') || host || hostname).toLowerCase();
        const username = url.username.toLowerCase();

        // Bug 3: include path in signature
        const path = url.searchParams.get('path') || '/';
        const signature = `${protocol}|${username}|${host}|${sni}|${path}`;
        if (seenConfigs.has(signature)) continue;
        seenConfigs.add(signature);

        url.hostname = FREE_IP;

        let finalConfig = url.toString();
        const originalRemark = line.split('#')[1];
        if (originalRemark) finalConfig += `#${originalRemark}`;

        filteredConfigs.push(finalConfig);
      } catch (_) {}
    }
  }

  // ============================================================
  // Bug 9: empty-result check (+ keep old file if it exists)
  // ============================================================
  if (filteredConfigs.length === 0) {
    console.error('⚠️ No configs found! All sources failed or filter too strict.');
    try {
      const old = await fs.readFile('sub.txt', 'utf8');
      if (old.trim().length > 0) {
        console.warn('ℹ️ Keeping existing sub.txt to avoid wiping the subscription.');
        return;
      }
    } catch (_) {}
    process.exit(1);
  }

  await fs.writeFile('sub.txt', filteredConfigs.join('\n'), 'utf8');
  console.log(`✅ Saved ${filteredConfigs.length} configs to sub.txt`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
