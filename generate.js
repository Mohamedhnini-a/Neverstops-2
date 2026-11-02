const fs = require('fs/promises');

// الليستة ديال الروابط ديالك (خليها كيفما هي عندك، هنا درت غير اختصار باش الكود يبان)
const sourceUrls = [
     "https://github.com/Mohamedhnini-a/testeur-2/raw/refs/heads/main/working_configs.txt",
     "https://github.com/0xRadikal/Free-v2ray-Configs/raw/refs/heads/main/all/configs.txt",
     "https://github.com/kort0881/vpn-vless-configs-russia/raw/refs/heads/main/data/githubmirror/ru-sni/trojan.txt",
     "https://github.com/kort0881/vpn-vless-configs-russia/raw/refs/heads/main/data/githubmirror/ru-sni/vless.txt",
     "https://github.com/asgharkapk/Sub-Config-Extractor/raw/refs/heads/main/output_configs/mixed/10ium/HiN-VPN/subscription/hiddify/trojan.yaml",
     "https://github.com/asgharkapk/Sub-Config-Extractor/raw/refs/heads/main/output_configs/mixed/10ium/HiN-VPN/subscription/hiddify/vmess.yaml",
     "https://github.com/asgharkapk/Sub-Config-Extractor/raw/refs/heads/main/output_configs/mixed/AzadNet/-t.me.yaml",
     "https://github.com/roosterkid/openproxylist/raw/refs/heads/main/V2RAY_RAW.txt",
     "https://github.com/SoliSpirit/SolVPN/raw/refs/heads/main/Protocols/trojan.txt",
     "https://github.com/SoliSpirit/SolVPN/blob/main/Protocols/vless.txt",
     "https://github.com/SoliSpirit/SolVPN/raw/refs/heads/main/Protocols/vmess.txt",
     "https://github.com/YawStar/Proxy-Hunter/raw/refs/heads/main/configs/proxy_configs_tested.txt",
     "https://github.com/chaishpish/free_server_v2ray/raw/refs/heads/main/@TFMTProto",
     "https://github.com/lm705/vair/raw/refs/heads/main/vless_alive.txt",
     "https://github.com/SoliSpirit/SolVPN/raw/refs/heads/main/Protocols/vless.txt",
     
     
];

// ============================================================
// HOST POOL (التوزيع بالتناوب)
// ============================================================
const HOST_POOL = [
  "104.18.37.127",
];

let hostIndex = 0; // مؤشر التوزيع

const FETCH_TIMEOUT_MS = 30_000;
const CONCURRENCY_LIMIT = 30;

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function isPrintableText(text) {
  if (!text) return false;
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
            if (!res.ok) {
              console.warn(`[FAIL ${res.status}] ${url}`);
              return '';
            }
            return res.text();
          })
          .catch((err) => {
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
  
  // ============================================================
  // Sets ديال الفلترة (Dedupe)
  // ============================================================
  const seenVless = new Set();
  const seenVmess = new Set();
  const seenTrojan = new Set();

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

          if (
            String(config.net || '').toLowerCase() !== 'ws' ||
            String(config.tls || '').toLowerCase() !== 'tls' ||
            parseInt(config.port, 10) !== 443
          ) {
            continue;
          }

          // ✅ فلترة التكرار حسب الـ ID فقط
          const vmessId = String(config.id || '').toLowerCase().trim();
          if (!vmessId || seenVmess.has(vmessId)) continue;
          seenVmess.add(vmessId);

          const server = String(config.add || '').toLowerCase().trim();
          if (!server) continue;

          // توزيع الـ Host
          const currentHost = HOST_POOL[hostIndex % HOST_POOL.length];
          hostIndex++;

          config.add = currentHost;
          // كنخليو الـ host و sni الأصليين باش ما يطيحش الـ TLS
          
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
        const port = url.port === '' ? 443 : parseInt(url.port, 10);

        if (
          (protocol !== 'vless' && protocol !== 'trojan') ||
          url.searchParams.get('type') !== 'ws' ||
          url.searchParams.get('security') !== 'tls' ||
          port !== 443
        ) {
          continue;
        }

        const username = url.username.toLowerCase().trim();
        if (!username) continue;

        // ✅ فلترة VLESS حسب الـ UUID فقط
        if (protocol === 'vless') {
          if (seenVless.has(username)) continue;
          seenVless.add(username);
        }

        // ✅ فلترة Trojan حسب الـ Password فقط
        if (protocol === 'trojan') {
          if (seenTrojan.has(username)) continue;
          seenTrojan.add(username);
        }

        // توزيع الـ Host
        const currentHost = HOST_POOL[hostIndex % HOST_POOL.length];
        hostIndex++;

        url.hostname = currentHost;

        let finalConfig = url.toString();
        const originalRemark = line.split('#')[1];
        if (originalRemark) finalConfig += `#${originalRemark}`;

        filteredConfigs.push(finalConfig);
      } catch (_) {}
    }
  }

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
