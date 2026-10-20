const fs = require('fs/promises');

const sourceUrls = [
  "https://raw.githubusercontent.com/F0rc3Run/F0rc3Run/refs/heads/main/Best-Results/proxies.txt",
  "https://raw.githubusercontent.com/flaafix/AetrisVPN-black-list/refs/heads/main/configs.txt",
  "https://github.com/MustafaBaqer/VestraNet-Nodes/raw/refs/heads/main/protocols/trojan.txt",
  "https://raw.githubusercontent.com/mahsanet/MahsaFreeConfig/refs/heads/main/mci/sub_1.txt",
  "https://raw.githubusercontent.com/mahsanet/MahsaFreeConfig/refs/heads/main/mci/sub_2.txt",
  "https://raw.githubusercontent.com/mahsanet/MahsaFreeConfig/refs/heads/main/mtn/sub_1.txt",
  "https://github.com/MustafaBaqer/VestraNet-Nodes/raw/refs/heads/main/protocols/vless.txt",
  "https://github.com/MohammadBahemmat/V2ray-Collector/raw/refs/heads/main/all_servers.txt",
  "https://github.com/VOID-Anonymity/V.O.I.D-VPN_Bypass/raw/refs/heads/main/url_work.txt",
  "https://github.com/0xRadikal/Free-v2ray-Configs/raw/refs/heads/main/heavy/configs.txt",
  "https://github.com/0xRadikal/Free-v2ray-Configs/raw/refs/heads/main/fast/configs.txt",
  "https://raw.githubusercontent.com/HosseinKoofi/GO_V2rayCollector/main/mixed_iran.txt",
  "https://github.com/hans-thomas/v2ray-subscription/raw/refs/heads/master/servers.txt",
  "https://github.com/ShatakVPN/ConfigForge-V2Ray/raw/refs/heads/main/configs/all.txt",
  "https://github.com/Epodonios/v2ray-configs/raw/refs/heads/main/All_Configs_Sub.txt",
  "https://github.com/ShatakVPN/ConfigForge-V2Ray/raw/refs/heads/main/configs/all.txt",
  "https://raw.githubusercontent.com/V2RayRoot/V2RayConfig/main/Config/vless.txt",
  "https://github.com/miladtahanian/V2RayCFGDumper/raw/refs/heads/main/sub.txt",
  "https://github.com/roosterkid/openproxylist/raw/refs/heads/main/V2RAY.txt",
  "https://github.com/SoliSpirit/SolVPN/raw/refs/heads/main/all_configs.txt",
  "https://github.com/liMilCo/v2r/raw/refs/heads/main/all_configs.txt",
  "https://sub.vlessfo.ru/vlessforu/working_configs.txt",
  "https://github.com/ebrasha/free-v2ray-public-list/raw/refs/heads/main/V2Ray-Config-By-EbraSha-All-Type.txt"
];

const FREE_IP = "104.18.37.127";

function decodeIfBase64(text) {
  try {
    const cleaned = text.trim().replace(/\s+/g, '');
    const normalized = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = Buffer.from(padded, 'base64').toString('utf8');

    // ✅ زدنا vmess:// هنا
    if (decoded.includes('vless://') || decoded.includes('trojan://') || decoded.includes('vmess://')) {
      return decoded;
    }
  } catch (_) {}

  return text;
}

// ✅ دالة فك Base64 ديال VMess
function b64DecodeUtf8(b64) {
  try {
    b64 = b64.trim().replace(/\s/g, '');
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch { return null; }
}

// ✅ دالة تشفير Base64 ديال VMess
function b64EncodeUtf8(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

async function main() {
  const results = await Promise.allSettled(
    sourceUrls.map(url =>
      fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })
        .then(res => (res.ok ? res.text() : ''))
    )
  );

  const texts = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  const filteredConfigs = [];
  const seenConfigs = new Set();

  for (let text of texts) {
    let decodedText = text;

    if (!text.includes('vless://') && !text.includes('trojan://') && !text.includes('vmess://')) {
      decodedText = decodeIfBase64(text);
    }

    const lines = decodedText.split(/\r?\n/);

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // ==========================================
      // 1. معالجة VMess
      // ==========================================
      if (line.startsWith('vmess://')) {
        try {
          const cleanLine = line.split('#')[0];
          const b64 = cleanLine.slice(8).trim();
          const jsonStr = b64DecodeUtf8(b64);
          if (!jsonStr) continue;
          
          const config = JSON.parse(jsonStr);

          // شروط: WS + TLS + Port 443
          if (
            String(config.net).toLowerCase() !== 'ws' || 
            String(config.tls).toLowerCase() !== 'tls' || 
            String(config.port) !== '443'
          ) continue;

          const host = String(config.host || config.sni || '').toLowerCase().trim();
          const sni = String(config.sni || config.host || '').toLowerCase().trim();
          if (!host || !sni) continue;

          // منع التكرار
          const signature = `vmess|${config.id}|${host}|${sni}`;
          if (seenConfigs.has(signature)) continue;
          seenConfigs.add(signature);

          // تعديل الـ IP
          config.add = FREE_IP;
          config.host = host;
          config.sni = sni;

          const newB64 = b64EncodeUtf8(JSON.stringify(config));
          filteredConfigs.push("vmess://" + newB64);
        } catch (_) {}
        continue;
      }

      // ==========================================
      // 2. معالجة VLESS و Trojan
      // ==========================================
      const cleanLine = line.split('#')[0].trim();

      if (!cleanLine.startsWith('vless://') && !cleanLine.startsWith('trojan://')) {
        continue;
      }

      try {
        const url = new URL(cleanLine);
        const protocol = url.protocol.replace(':', '').toLowerCase();

        if (
          (protocol !== 'vless' && protocol !== 'trojan') ||
          url.searchParams.get('type') !== 'ws' ||
          url.searchParams.get('security') !== 'tls' ||
          url.port !== '443'
        ) {
          continue;
        }

        const username = url.username.toLowerCase();
        const host = (url.searchParams.get('host') || '').toLowerCase();
        const sni = (url.searchParams.get('sni') || '').toLowerCase();

        const signature = `${protocol}|${username}|${host}|${sni}`;

        if (seenConfigs.has(signature)) continue;
        seenConfigs.add(signature);

        url.hostname = FREE_IP;

        let finalConfig = url.toString();

        const originalRemark = line.split('#')[1];
        if (originalRemark) {
          finalConfig += `#${originalRemark}`;
        }

        filteredConfigs.push(finalConfig);
      } catch (_) {}
    }
  }

  // حفظ كنص عادي باش Cloudflare يشفرو
  await fs.writeFile('sub.txt', filteredConfigs.join('\n'), 'utf8');
  console.log(`✅ Saved ${filteredConfigs.length} configs to sub.txt`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
