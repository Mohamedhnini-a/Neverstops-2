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
  "https://github.com/ebrasha/free-v2ray-public-list/raw/refs/heads/main/V2Ray-Config-By-EbraSha-All-Type.txt",
];

const FREE_IP = "104.18.37.127";

function decodeIfBase64(text) {
  try {
    const cleaned = text.trim().replace(/\s+/g, '');
    const normalized = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = Buffer.from(padded, 'base64').toString('utf8');

    if (decoded.includes('vless://') || decoded.includes('trojan://')) {
      return decoded;
    }
  } catch (_) {}

  return text;
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

    if (!text.includes('vless://') && !text.includes('trojan://')) {
      decodedText = decodeIfBase64(text);
    }

    const lines = decodedText.split(/\r?\n/);

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

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

  await fs.writeFile('sub.txt', filteredConfigs.join('\n'), 'utf8');
  console.log(`Saved ${filteredConfigs.length} configs to sub.txt`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
