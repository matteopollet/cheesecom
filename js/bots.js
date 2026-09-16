/* ============================================================
   cheesecom — roster de bots + générateur d'avatars SVG
   Avatars déterministes (seed = id du bot) : humains & robots.
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- PRNG déterministe ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }

  /* ---------- drapeaux (mini SVG) ---------- */
  var FLAGS = {
    DE: ['#000', '#dd0000', '#ffce00'],
    FR: ['#0055a4', '#fff', '#ef4135', 'v'],
    IT: ['#009246', '#fff', '#ce2b37', 'v'],
    ES: ['#aa151b', '#f1bf00', '#aa151b'],
    NL: ['#ae1c28', '#fff', '#21468b'],
    BE: ['#000', '#fdda24', '#ef3340', 'v'],
    GB: ['#012169', '#fff', '#c8102e', 'uk'],
    US: ['#b22234', '#fff', '#3c3b6e', 'us'],
    BR: ['#009c3b', '#ffdf00', '#002776', 'br'],
    IN: ['#ff9933', '#fff', '#138808'],
    JP: ['#fff', '#bc002d', 'jp'],
    SE: ['#006aa7', '#fecc00', 'se'],
    NO: ['#ba0c2f', '#fff', 'no'],
    RU: ['#fff', '#0039a6', '#d52b1e'],
    UA: ['#005bbb', '#ffd500'],
    PL: ['#fff', '#dc143c'],
    CN: ['#de2910', '#ffde00', 'cn'],
    KR: ['#fff', '#cd2e3a', 'kr'],
    AR: ['#74acdf', '#fff', '#74acdf'],
    CA: ['#d52b1e', '#fff', '#d52b1e', 'ca'],
    CH: ['#d52b1e', '#fff', 'ch'],
    PT: ['#046a38', '#d52b1e', 'pt'],
    GR: ['#0d5eaf', '#fff', 'gr'],
    TR: ['#e30a17', '#fff', 'tr'],
    AU: ['#00247d', '#fff', 'au'],
    MX: ['#006847', '#fff', '#ce1126', 'v'],
    DK: ['#c8102e', '#fff', 'dk'],
    FI: ['#fff', '#002f6c', 'fi'],
    HU: ['#cd2a3e', '#fff', '#436f4d'],
    CZ: ['#fff', '#d7141a', '#11457e', 'cz'],
    RO: ['#002b7f', '#fcd116', '#ce1126', 'v'],
    AT: ['#ef3340', '#fff', '#ef3340'],
    IL: ['#fff', '#0038b8', 'il'],
    EG: ['#ce1126', '#fff', '#000'],
    ZA: ['#e03c31', '#007749', '#001489', 'za'],
    MA: ['#c1272d', '#006233', 'ma'],
    IS: ['#02529c', '#fff', 'is'],
    IE: ['#169b62', '#fff', '#ff883e', 'v'],
    NZ: ['#00247d', '#c8102e', 'nz'],
    PH: ['#0038a8', '#ce1126', '#fff', 'ph'],
    BG: ['#fff', '#00966e', '#d62612'],
    HR: ['#ff0000', '#fff', '#171796'],
    RS: ['#c6363c', '#0c4076', '#fff'],
    SK: ['#fff', '#0b4ea2', '#ee1c25'],
    SI: ['#fff', '#005da4', '#ed1c24'],
    EE: ['#0072ce', '#000', '#fff'],
    LV: ['#9e3039', '#fff', '#9e3039'],
    LT: ['#fdb913', '#006a44', '#c1272d'],
    GE: ['#fff', '#ff0000', 'ge'],
    AM: ['#d90012', '#0033a0', '#f2a800'],
    AZ: ['#00b5e2', '#ef3340', '#63b74c'],
    KZ: ['#00afca', '#fec50c', 'kz'],
    UZ: ['#1eb53a', '#0099b5', '#ce1126', 'uz'],
    MN: ['#c4272f', '#015197', '#c4272f', 'mn'],
    TH: ['#a51931', '#f4f5f8', '#2d2a4a', 'th'],
    VN: ['#da251d', '#ffff00', 'vn'],
    ID: ['#e70011', '#fff'],
    MY: ['#cc0001', '#fff', '#010066', 'my'],
    SG: ['#ef3340', '#fff', 'sg'],
    PE: ['#d91023', '#fff', '#d91023', 'v'],
    CL: ['#fff', '#d52b1e', '#0039a6', 'cl'],
    CO: ['#fcd116', '#0038a8', '#ce1126'],
    CU: ['#002590', '#fff', '#cf142b', 'cu'],
    NG: ['#008751', '#fff', '#008751', 'v'],
    KE: ['#000', '#bb0000', '#006600', 'ke'],
    CHEESE: ['#f7d354', '#e8a020', '#c96a12']
  };

  function flagSVG(code, w) {
    w = w || 20;
    var h = Math.round(w * 0.72);
    var f = FLAGS[code] || FLAGS.CHEESE;
    var svg;
    if (f[3] === 'v') {
      var w3 = (w / 3).toFixed(1);
      svg = '<rect width="' + w3 + '" height="' + h + '" fill="' + f[0] + '"/>' +
            '<rect x="' + w3 + '" width="' + w3 + '" height="' + h + '" fill="' + f[1] + '"/>' +
            '<rect x="' + (2 * w / 3).toFixed(1) + '" width="' + w3 + '" height="' + h + '" fill="' + f[2] + '"/>';
    } else {
      var h3 = (h / 3).toFixed(1);
      svg = '<rect width="' + w + '" height="' + h3 + '" fill="' + f[0] + '"/>' +
            '<rect y="' + h3 + '" width="' + w + '" height="' + h3 + '" fill="' + f[1] + '"/>' +
            '<rect y="' + (2 * h / 3).toFixed(1) + '" width="' + w + '" height="' + h3 + '" fill="' + f[2] + '"/>';
    }
    /* motifs spéciaux simplifiés */
    var cx = w / 2, cy = h / 2;
    switch (f[3]) {
      case 'uk': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<path d="M0 0L' + w + ' ' + h + 'M' + w + ' 0L0 ' + h + '" stroke="' + f[1] + '" stroke-width="' + (h * 0.18) + '"/>' +
        '<path d="M0 0L' + w + ' ' + h + 'M' + w + ' 0L0 ' + h + '" stroke="' + f[2] + '" stroke-width="' + (h * 0.08) + '"/>' +
        '<path d="M' + cx + ' 0V' + h + 'M0 ' + cy + 'H' + w + '" stroke="' + f[1] + '" stroke-width="' + (h * 0.3) + '"/>' +
        '<path d="M' + cx + ' 0V' + h + 'M0 ' + cy + 'H' + w + '" stroke="' + f[2] + '" stroke-width="' + (h * 0.16) + '"/>'; break;
      case 'us': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[1] + '"/>' +
        '<rect width="' + w + '" height="' + (h * 0.54) + '" fill="' + f[0] + '" y="0" opacity="0"/>' +
        '<path d="M0 0H' + w + 'M0 ' + (h * 0.15) + 'H' + w + 'M0 ' + (h * 0.31) + 'H' + w + 'M0 ' + (h * 0.46) + 'H' + w + 'M0 ' + (h * 0.62) + 'H' + w + 'M0 ' + (h * 0.77) + 'H' + w + 'M0 ' + (h * 0.92) + 'H' + w + '" stroke="' + f[0] + '" stroke-width="' + (h * 0.077) + '"/>' +
        '<rect width="' + (w * 0.45) + '" height="' + (h * 0.54) + '" fill="' + f[2] + '"/>'; break;
      case 'br': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<path d="M' + cx + ' ' + (h * 0.08) + 'L' + (w * 0.92) + ' ' + cy + 'L' + cx + ' ' + (h * 0.92) + 'L' + (w * 0.08) + ' ' + cy + 'Z" fill="' + f[1] + '"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + (h * 0.22) + '" fill="' + f[2] + '"/>'; break;
      case 'jp': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + (h * 0.28) + '" fill="' + f[1] + '"/>'; break;
      case 'se': case 'no': case 'dk': case 'fi': case 'is':
        var cross = f[f.length - 1];
        svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
          '<rect x="' + (w * 0.3) + '" width="' + (w * 0.16) + '" height="' + h + '" fill="' + (cross === 'no' || cross === 'is' ? f[1] : f[1]) + '"/>' +
          '<rect y="' + (h * 0.4) + '" width="' + w + '" height="' + (h * 0.2) + '" fill="' + f[1] + '"/>';
        if (cross === 'no' || cross === 'is' || cross === 'dk') {
          svg += '<rect x="' + (w * 0.33) + '" width="' + (w * 0.09) + '" height="' + h + '" fill="' + (cross === 'dk' ? '#fff' : f[2] || '#002868') + '"/>' +
                 '<rect y="' + (h * 0.44) + '" width="' + w + '" height="' + (h * 0.11) + '" fill="' + (cross === 'dk' ? '#fff' : f[2] || '#002868') + '"/>';
        }
        if (cross === 'dk') svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
          '<rect x="' + (w * 0.32) + '" width="' + (w * 0.14) + '" height="' + h + '" fill="#fff"/>' +
          '<rect y="' + (h * 0.42) + '" width="' + w + '" height="' + (h * 0.18) + '" fill="#fff"/>';
        break;
      case 'ch': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<rect x="' + (cx - w * 0.08) + '" y="' + (h * 0.15) + '" width="' + (w * 0.16) + '" height="' + (h * 0.7) + '" fill="#fff"/>' +
        '<rect x="' + (w * 0.14) + '" y="' + (cy - h * 0.11) + '" width="' + (w * 0.72) + '" height="' + (h * 0.22) + '" fill="#fff"/>'; break;
      case 'ca': svg = '<rect width="' + (w / 4) + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<rect x="' + (w * 0.75) + '" width="' + (w / 4) + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<rect x="' + (w / 4) + '" width="' + (w / 2) + '" height="' + h + '" fill="#fff"/>' +
        '<path d="M' + cx + ' ' + (h * 0.2) + 'l' + (w * 0.05) + ' ' + (h * 0.2) + ' ' + (w * 0.08) + ' ' + (-h * 0.05) + 'l' + (-w * 0.03) + ' ' + (h * 0.18) + 'h' + (-w * 0.1) + 'l' + (-w * 0.03) + ' ' + (-h * 0.18) + ' ' + (w * 0.08) + ' ' + (h * 0.05) + 'z" fill="' + f[0] + '"/>'; break;
      case 'cz': svg = '<rect width="' + w + '" height="' + (h / 2) + '" fill="' + f[0] + '"/>' +
        '<rect y="' + (h / 2) + '" width="' + w + '" height="' + (h / 2) + '" fill="' + f[1] + '"/>' +
        '<path d="M0 0L' + (w * 0.45) + ' ' + cy + 'L0 ' + h + 'Z" fill="' + f[2] + '"/>'; break;
      case 'pt': svg = '<rect width="' + (w * 0.4) + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<rect x="' + (w * 0.4) + '" width="' + (w * 0.6) + '" height="' + h + '" fill="' + f[1] + '"/>' +
        '<circle cx="' + (w * 0.4) + '" cy="' + cy + '" r="' + (h * 0.2) + '" fill="#ffdf00"/>'; break;
      case 'gr': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<path d="M0 ' + (h / 9) + 'H' + w + 'M0 ' + (h / 3) + 'H' + w + 'M0 ' + (5 * h / 9) + 'H' + w + 'M0 ' + (7 * h / 9) + 'H' + w + '" stroke="' + f[1] + '" stroke-width="' + (h / 9) + '"/>' +
        '<rect width="' + (w * 0.38) + '" height="' + (5 * h / 9) + '" fill="' + f[0] + '"/>' +
        '<rect x="' + (w * 0.15) + '" width="' + (w * 0.08) + '" height="' + (5 * h / 9) + '" fill="' + f[1] + '"/>' +
        '<rect y="' + (2 * h / 9) + '" width="' + (w * 0.38) + '" height="' + (h / 9) + '" fill="' + f[1] + '"/>'; break;
      case 'tr': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<circle cx="' + (w * 0.42) + '" cy="' + cy + '" r="' + (h * 0.3) + '" fill="#fff"/>' +
        '<circle cx="' + (w * 0.48) + '" cy="' + cy + '" r="' + (h * 0.24) + '" fill="' + f[0] + '"/>' +
        '<path d="M' + (w * 0.68) + ' ' + cy + 'l' + (-w * 0.1) + ' ' + (-h * 0.09) + 'l' + (w * 0.02) + ' ' + (h * 0.13) + 'l' + (w * 0.1) + ' ' + (-h * 0.08) + 'l' + (-w * 0.11) + ' ' + (-h * 0.02) + 'l' + (w * 0.09) + ' ' + (-h * 0.02) + 'z" fill="#fff" transform="rotate(-15 ' + (w * 0.66) + ' ' + cy + ')"/>'; break;
      case 'il': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<rect y="' + (h * 0.08) + '" width="' + w + '" height="' + (h * 0.14) + '" fill="' + f[1] + '"/>' +
        '<rect y="' + (h * 0.78) + '" width="' + w + '" height="' + (h * 0.14) + '" fill="' + f[1] + '"/>' +
        '<path d="M' + cx + ' ' + (h * 0.28) + 'l' + (w * 0.11) + ' ' + (h * 0.19) + 'h' + (-w * 0.22) + 'z M' + cx + ' ' + (h * 0.72) + 'l' + (w * 0.11) + ' ' + (-h * 0.19) + 'h' + (-w * 0.22) + 'z" fill="none" stroke="' + f[1] + '" stroke-width="' + (h * 0.04) + '"/>'; break;
      case 'za': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<rect y="' + (h * 0.67) + '" width="' + w + '" height="' + (h * 0.33) + '" fill="' + f[1] + '"/>' +
        '<path d="M0 0L' + (w * 0.45) + ' ' + cy + 'L0 ' + h + '" stroke="#fff" stroke-width="' + (h * 0.22) + '" fill="none"/>' +
        '<path d="M0 0L' + (w * 0.4) + ' ' + cy + 'L0 ' + h + 'Z" fill="#000"/>' +
        '<path d="M' + (w * 0.4) + ' ' + cy + 'L0 ' + (h * 0.12) + 'M' + (w * 0.4) + ' ' + cy + 'L0 ' + (h * 0.88) + '" stroke="' + f[1] + '" stroke-width="' + (h * 0.1) + '"/>' +
        '<path d="M' + (w * 0.4) + ' ' + cy + 'H' + w + '" stroke="' + f[1] + '" stroke-width="' + (h * 0.16) + '"/>' +
        '<path d="M' + (w * 0.42) + ' ' + cy + 'H' + w + '" stroke="#ffb81c" stroke-width="' + (h * 0.08) + '"/>'; break;
      case 'cn': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<path d="M' + (w * 0.18) + ' ' + (h * 0.12) + 'l' + (w * 0.04) + ' ' + (h * 0.12) + ' ' + (w * 0.12) + ' ' + (h * 0.01) + 'l' + (-w * 0.09) + ' ' + (h * 0.08) + 'l' + (w * 0.03) + ' ' + (h * 0.13) + 'l' + (-w * 0.11) + ' ' + (-h * 0.08) + 'l' + (-w * 0.09) + ' ' + (h * 0.08) + ' ' + (w * 0.03) + ' ' + (-h * 0.13) + 'l' + (-w * 0.09) + ' ' + (-h * 0.08) + ' ' + (w * 0.12) + ' ' + (-h * 0.01) + 'z" fill="' + f[1] + '"/>'; break;
      case 'kr': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + (h * 0.26) + '" fill="' + f[1] + '"/>' +
        '<path d="M' + (cx - h * 0.26) + ' ' + cy + 'a' + (h * 0.26) + ' ' + (h * 0.26) + ' 0 0 1 ' + (h * 0.52) + ' 0a' + (h * 0.13) + ' ' + (h * 0.13) + ' 0 0 1 ' + (-h * 0.26) + ' 0a' + (h * 0.13) + ' ' + (h * 0.13) + ' 0 0 0 ' + (-h * 0.26) + ' 0z" fill="#0047a0"/>'; break;
      case 'ge': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<rect x="' + (cx - w * 0.06) + '" width="' + (w * 0.12) + '" height="' + h + '" fill="' + f[1] + '"/>' +
        '<rect y="' + (cy - h * 0.09) + '" width="' + w + '" height="' + (h * 0.18) + '" fill="' + f[1] + '"/>' +
        '<g fill="' + f[1] + '"><rect x="' + (w * 0.18) + '" y="' + (h * 0.14) + '" width="' + (w * 0.09) + '" height="' + (h * 0.09) + '"/><rect x="' + (w * 0.72) + '" y="' + (h * 0.14) + '" width="' + (w * 0.09) + '" height="' + (h * 0.09) + '"/><rect x="' + (w * 0.18) + '" y="' + (h * 0.75) + '" width="' + (w * 0.09) + '" height="' + (h * 0.09) + '"/><rect x="' + (w * 0.72) + '" y="' + (h * 0.75) + '" width="' + (w * 0.09) + '" height="' + (h * 0.09) + '"/></g>'; break;
      case 'ke': svg = '<rect width="' + w + '" height="' + (h / 3) + '" fill="' + f[0] + '"/>' +
        '<rect y="' + (h / 3) + '" width="' + w + '" height="' + (h / 3) + '" fill="' + f[1] + '"/>' +
        '<rect y="' + (2 * h / 3) + '" width="' + w + '" height="' + (h / 3) + '" fill="' + f[2] + '"/>' +
        '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + (w * 0.1) + '" ry="' + (h * 0.38) + '" fill="' + f[1] + '" stroke="#fff" stroke-width="' + (h * 0.05) + '"/>'; break;
      case 'ma': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<path d="M' + cx + ' ' + (h * 0.2) + 'L' + (w * 0.68) + ' ' + (h * 0.68) + 'L' + (w * 0.32) + ' ' + (h * 0.68) + 'L' + (w * 0.72) + ' ' + (h * 0.36) + 'L' + (w * 0.28) + ' ' + (h * 0.36) + 'Z" fill="none" stroke="' + f[1] + '" stroke-width="' + (h * 0.05) + '"/>'; break;
      case 'vn': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<path d="M' + cx + ' ' + (h * 0.15) + 'l' + (w * 0.06) + ' ' + (h * 0.19) + 'l' + (w * 0.2) + ' ' + (h * 0.01) + 'l' + (-w * 0.16) + ' ' + (h * 0.12) + 'l' + (w * 0.05) + ' ' + (h * 0.2) + 'l' + (-w * 0.16) + ' ' + (-h * 0.12) + 'l' + (-w * 0.16) + ' ' + (h * 0.12) + 'l' + (w * 0.05) + ' ' + (-h * 0.2) + 'l' + (-w * 0.16) + ' ' + (-h * 0.12) + 'l' + (w * 0.2) + ' ' + (-h * 0.01) + 'z" fill="' + f[1] + '"/>'; break;
      case 'cl': svg = '<rect width="' + w + '" height="' + (h / 2) + '" fill="' + f[0] + '"/>' +
        '<rect y="' + (h / 2) + '" width="' + w + '" height="' + (h / 2) + '" fill="' + f[1] + '"/>' +
        '<rect width="' + (w * 0.38) + '" height="' + (h / 2) + '" fill="' + f[2] + '"/>' +
        '<circle cx="' + (w * 0.19) + '" cy="' + (h / 4) + '" r="' + (h * 0.08) + '" fill="#fff"/>'; break;
      case 'cu': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<rect y="' + (h / 5) + '" width="' + w + '" height="' + (h / 5) + '" fill="' + f[1] + '"/>' +
        '<rect y="' + (3 * h / 5) + '" width="' + w + '" height="' + (h / 5) + '" fill="' + f[1] + '"/>' +
        '<path d="M0 0L' + (w * 0.45) + ' ' + cy + 'L0 ' + h + 'Z" fill="' + f[2] + '"/>' +
        '<circle cx="' + (w * 0.15) + '" cy="' + cy + '" r="' + (h * 0.07) + '" fill="#fff"/>'; break;
      case 'ph': svg = '<rect width="' + w + '" height="' + (h / 2) + '" fill="' + f[0] + '"/>' +
        '<rect y="' + (h / 2) + '" width="' + w + '" height="' + (h / 2) + '" fill="' + f[1] + '"/>' +
        '<path d="M0 0L' + (w * 0.45) + ' ' + cy + 'L0 ' + h + 'Z" fill="' + f[2] + '"/>' +
        '<circle cx="' + (w * 0.13) + '" cy="' + cy + '" r="' + (h * 0.09) + '" fill="#fc0"/>'; break;
      case 'my': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[1] + '"/>' +
        '<path d="M0 0H' + w + 'M0 ' + (h / 7) + 'H' + w + 'M0 ' + (2 * h / 7) + 'H' + w + 'M0 ' + (3 * h / 7) + 'H' + w + 'M0 ' + (4 * h / 7) + 'H' + w + 'M0 ' + (5 * h / 7) + 'H' + w + 'M0 ' + (6 * h / 7) + 'H' + w + '" stroke="' + f[0] + '" stroke-width="' + (h / 14) + '"/>' +
        '<rect width="' + (w * 0.5) + '" height="' + (4 * h / 7) + '" fill="' + f[2] + '"/>' +
        '<circle cx="' + (w * 0.18) + '" cy="' + (2 * h / 7) + '" r="' + (h * 0.16) + '" fill="#fc0"/>'; break;
      case 'sg': svg = '<rect width="' + w + '" height="' + (h / 2) + '" fill="' + f[0] + '"/>' +
        '<rect y="' + (h / 2) + '" width="' + w + '" height="' + (h / 2) + '" fill="' + f[1] + '"/>' +
        '<circle cx="' + (w * 0.2) + '" cy="' + (h * 0.26) + '" r="' + (h * 0.16) + '" fill="#fff"/>' +
        '<circle cx="' + (w * 0.26) + '" cy="' + (h * 0.26) + '" r="' + (h * 0.13) + '" fill="' + f[0] + '"/>'; break;
      case 'th': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<rect y="' + (h / 6) + '" width="' + w + '" height="' + (h / 6) + '" fill="' + f[1] + '"/>' +
        '<rect y="' + (h / 3) + '" width="' + w + '" height="' + (h / 3) + '" fill="' + f[2] + '"/>' +
        '<rect y="' + (2 * h / 3) + '" width="' + w + '" height="' + (h / 6) + '" fill="' + f[1] + '"/>'; break;
      case 'nz': case 'au': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<g transform="scale(0.5)"><rect width="' + w + '" height="' + h + '" fill="#012169"/>' +
        '<path d="M0 0L' + w + ' ' + h + 'M' + w + ' 0L0 ' + h + '" stroke="#fff" stroke-width="' + (h * 0.18) + '"/>' +
        '<path d="M0 0L' + w + ' ' + h + 'M' + w + ' 0L0 ' + h + '" stroke="#c8102e" stroke-width="' + (h * 0.08) + '"/>' +
        '<path d="M' + cx + ' 0V' + h + 'M0 ' + cy + 'H' + w + '" stroke="#fff" stroke-width="' + (h * 0.3) + '"/>' +
        '<path d="M' + cx + ' 0V' + h + 'M0 ' + cy + 'H' + w + '" stroke="#c8102e" stroke-width="' + (h * 0.16) + '"/></g>' +
        '<g fill="' + f[1] + '"><circle cx="' + (w * 0.72) + '" cy="' + (h * 0.3) + '" r="' + (h * 0.06) + '"/><circle cx="' + (w * 0.8) + '" cy="' + (h * 0.55) + '" r="' + (h * 0.06) + '"/><circle cx="' + (w * 0.62) + '" cy="' + (h * 0.6) + '" r="' + (h * 0.06) + '"/><circle cx="' + (w * 0.72) + '" cy="' + (h * 0.8) + '" r="' + (h * 0.06) + '"/></g>'; break;
      case 'uz': svg = '<rect width="' + w + '" height="' + (h / 3) + '" fill="' + f[1] + '"/>' +
        '<rect y="' + (h / 3) + '" width="' + w + '" height="' + (h / 3) + '" fill="#fff"/>' +
        '<rect y="' + (2 * h / 3) + '" width="' + w + '" height="' + (h / 3) + '" fill="' + f[0] + '"/>' +
        '<rect y="' + (h / 3 - h * 0.03) + '" width="' + w + '" height="' + (h * 0.06) + '" fill="' + f[2] + '"/>' +
        '<rect y="' + (2 * h / 3 - h * 0.03) + '" width="' + w + '" height="' + (h * 0.06) + '" fill="' + f[2] + '"/>' +
        '<circle cx="' + (w * 0.18) + '" cy="' + (h * 0.18) + '" r="' + (h * 0.11) + '" fill="#fff"/>' +
        '<circle cx="' + (w * 0.22) + '" cy="' + (h * 0.18) + '" r="' + (h * 0.09) + '" fill="' + f[1] + '"/>'; break;
      case 'kz': svg = '<rect width="' + w + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<circle cx="' + cx + '" cy="' + (h * 0.42) + '" r="' + (h * 0.18) + '" fill="' + f[1] + '"/>' +
        '<path d="M' + cx + ' ' + (h * 0.68) + 'q' + (w * 0.15) + ' ' + (-h * 0.15) + ' ' + (w * 0.28) + ' 0q' + (-w * 0.13) + ' ' + (-h * 0.05) + ' ' + (-w * 0.28) + ' 0z" fill="' + f[1] + '"/>' +
        '<rect x="' + (w * 0.06) + '" y="' + (h * 0.08) + '" width="' + (w * 0.06) + '" height="' + (h * 0.84) + '" fill="' + f[1] + '"/>'; break;
      case 'mn': svg = '<rect width="' + (w / 3) + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<rect x="' + (w / 3) + '" width="' + (w / 3) + '" height="' + h + '" fill="' + f[1] + '"/>' +
        '<rect x="' + (2 * w / 3) + '" width="' + (w / 3) + '" height="' + h + '" fill="' + f[0] + '"/>' +
        '<circle cx="' + (w / 6) + '" cy="' + cy + '" r="' + (h * 0.16) + '" fill="#f9cf02"/>'; break;
      case 'co': svg = '<rect width="' + w + '" height="' + (h / 2) + '" fill="' + f[0] + '"/>' +
        '<rect y="' + (h / 2) + '" width="' + w + '" height="' + (h / 4) + '" fill="' + f[1] + '"/>' +
        '<rect y="' + (3 * h / 4) + '" width="' + w + '" height="' + (h / 4) + '" fill="' + f[2] + '"/>'; break;
      default: break;
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" style="border-radius:2px;flex:none">' + svg + '</svg>';
  }

  /* ---------- générateur d'avatars ---------- */
  var SKIN = ['#f8d3b8', '#f0c090', '#d9a06b', '#a9744f', '#8d5524', '#ffdbac'];
  var METAL = ['#b8c4cc', '#9aa8b4', '#cfd8de', '#8b98a5', '#d4a94e', '#c97e4e'];
  var BG = ['#7fa650', '#5b88b7', '#b75b5b', '#8d6ab8', '#b78d5b', '#5bb79d', '#b75b95', '#6a7fb8', '#a6a650', '#5b94b7'];
  var HAIR = ['#3b2d24', '#1d1d1d', '#8a5a2b', '#c9a227', '#b04a2f', '#d8d8d8', '#4a4a4a'];

  function avatarSVG(bot, size) {
    size = size || 80;
    var r = mulberry32(hashStr(bot.id));
    var robot = bot.robot;
    var bg = pick(r, BG);
    var face = robot ? pick(r, METAL) : pick(r, SKIN);
    var hair = pick(r, HAIR);
    var s = '';

    /* fond */
    s += '<rect width="80" height="80" rx="0" fill="' + bg + '"/>';
    s += '<circle cx="' + (12 + r() * 56) + '" cy="' + (10 + r() * 20) + '" r="' + (14 + r() * 10) + '" fill="#ffffff" opacity="0.08"/>';

    /* cou */
    s += '<rect x="33" y="58" width="14" height="10" rx="3" fill="' + face + '"/>';
    /* corps */
    var body = pick(r, BG);
    while (body === bg) body = pick(r, BG);
    s += '<path d="M16 80 Q16 64 40 64 Q64 64 64 80 Z" fill="' + body + '"/>';

    /* tête */
    var headShape = robot ? pick(r, ['rect', 'round', 'wide']) : pick(r, ['round', 'oval', 'square']);
    if (headShape === 'rect') s += '<rect x="20" y="14" width="40" height="46" rx="8" fill="' + face + '"/>';
    else if (headShape === 'wide') s += '<rect x="16" y="20" width="48" height="38" rx="12" fill="' + face + '"/>';
    else if (headShape === 'square') s += '<rect x="21" y="14" width="38" height="46" rx="6" fill="' + face + '"/>';
    else if (headShape === 'oval') s += '<ellipse cx="40" cy="38" rx="20" ry="24" fill="' + face + '"/>';
    else s += '<circle cx="40" cy="38" r="22" fill="' + face + '"/>';

    /* oreilles (humains) */
    if (!robot && headShape !== 'rect') {
      s += '<circle cx="19" cy="40" r="4" fill="' + face + '"/><circle cx="61" cy="40" r="4" fill="' + face + '"/>';
    }

    var eyeY = headShape === 'wide' ? 38 : 36;
    var eyeStyle = pick(r, ['dot', 'happy', 'calm', 'glasses', 'sleepy', 'mono', 'wink', 'visor']);
    if (robot && r() < 0.4) eyeStyle = 'visor';

    function eye(cx2, cy2) {
      return '<circle cx="' + cx2 + '" cy="' + cy2 + '" r="3" fill="#20242a"/>';
    }
    switch (eyeStyle) {
      case 'dot':
        s += eye(31, eyeY) + eye(49, eyeY); break;
      case 'happy':
        s += '<path d="M27 ' + (eyeY + 1) + ' Q31 ' + (eyeY - 3) + ' 35 ' + (eyeY + 1) + '" stroke="#20242a" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
             '<path d="M45 ' + (eyeY + 1) + ' Q49 ' + (eyeY - 3) + ' 53 ' + (eyeY + 1) + '" stroke="#20242a" stroke-width="2.4" fill="none" stroke-linecap="round"/>'; break;
      case 'calm':
        s += eye(31, eyeY) + eye(49, eyeY) +
             '<rect x="27" y="' + (eyeY - 7) + '" width="8" height="2" rx="1" fill="#20242a" opacity="0.6"/>' +
             '<rect x="45" y="' + (eyeY - 7) + '" width="8" height="2" rx="1" fill="#20242a" opacity="0.6"/>'; break;
      case 'glasses':
        s += eye(31, eyeY) + eye(49, eyeY) +
             '<circle cx="31" cy="' + eyeY + '" r="6.5" fill="none" stroke="#2b2f36" stroke-width="2"/>' +
             '<circle cx="49" cy="' + eyeY + '" r="6.5" fill="none" stroke="#2b2f36" stroke-width="2"/>' +
             '<path d="M37.5 ' + eyeY + ' H42.5 M24.5 ' + eyeY + ' H19 M55.5 ' + eyeY + ' H61" stroke="#2b2f36" stroke-width="2"/>'; break;
      case 'sleepy':
        s += '<path d="M27 ' + eyeY + ' H35 M45 ' + eyeY + ' H53" stroke="#20242a" stroke-width="2.4" stroke-linecap="round"/>'; break;
      case 'mono':
        s += eye(31, eyeY) + eye(49, eyeY) +
             '<circle cx="49" cy="' + eyeY + '" r="6" fill="none" stroke="#2b2f36" stroke-width="1.8"/>' +
             '<path d="M49 ' + (eyeY + 6) + ' Q49 ' + (eyeY + 14) + ' 45 ' + (eyeY + 16) + '" stroke="#2b2f36" stroke-width="1.4" fill="none"/>'; break;
      case 'wink':
        s += eye(31, eyeY) + '<path d="M45 ' + eyeY + ' H53" stroke="#20242a" stroke-width="2.4" stroke-linecap="round"/>'; break;
      case 'visor':
        s += '<rect x="24" y="' + (eyeY - 5) + '" width="32" height="10" rx="5" fill="#20242a"/>' +
             '<rect x="27" y="' + (eyeY - 2) + '" width="10" height="4" rx="2" fill="#5ee0ff"/>' +
             '<rect x="43" y="' + (eyeY - 2) + '" width="10" height="4" rx="2" fill="#5ee0ff"/>'; break;
    }

    /* bouche */
    var mY = 50;
    var mouth = pick(r, ['smile', 'grin', 'flat', 'o', 'small', 'cat', 'grill']);
    if (robot && r() < 0.3) mouth = 'grill';
    switch (mouth) {
      case 'smile': s += '<path d="M33 ' + mY + ' Q40 ' + (mY + 6) + ' 47 ' + mY + '" stroke="#20242a" stroke-width="2.2" fill="none" stroke-linecap="round"/>'; break;
      case 'grin': s += '<path d="M32 ' + (mY - 1) + ' Q40 ' + (mY + 8) + ' 48 ' + (mY - 1) + ' Z" fill="#20242a"/><rect x="34" y="' + (mY - 1) + '" width="12" height="2.4" fill="#fff"/>'; break;
      case 'flat': s += '<path d="M34 ' + mY + ' H46" stroke="#20242a" stroke-width="2.2" stroke-linecap="round"/>'; break;
      case 'o': s += '<circle cx="40" cy="' + (mY + 1) + '" r="3.4" fill="#20242a"/>'; break;
      case 'small': s += '<path d="M37 ' + mY + ' Q40 ' + (mY + 3) + ' 43 ' + mY + '" stroke="#20242a" stroke-width="2" fill="none" stroke-linecap="round"/>'; break;
      case 'cat': s += '<path d="M40 ' + (mY - 2) + ' Q36 ' + (mY + 3) + ' 33 ' + mY + ' M40 ' + (mY - 2) + ' Q44 ' + (mY + 3) + ' 47 ' + mY + '" stroke="#20242a" stroke-width="2" fill="none" stroke-linecap="round"/>'; break;
      case 'grill': s += '<rect x="33" y="' + (mY - 3) + '" width="14" height="8" rx="2" fill="#20242a"/><path d="M36 ' + (mY - 3) + ' V' + (mY + 5) + ' M40 ' + (mY - 3) + ' V' + (mY + 5) + ' M44 ' + (mY - 3) + ' V' + (mY + 5) + '" stroke="' + face + '" stroke-width="1.6"/>'; break;
    }

    /* accessoires tête */
    var acc = robot ? pick(r, ['antenna', 'ears', 'antenna2', 'none', 'dish']) :
                      pick(r, ['hair', 'hair', 'cap', 'tuft', 'headband', 'headphones', 'none', 'bow']);
    switch (acc) {
      case 'antenna': s += '<path d="M40 14 V4" stroke="' + face + '" stroke-width="3" stroke-linecap="round"/><circle cx="40" cy="4" r="3.5" fill="#ff5a5a"/>'; break;
      case 'antenna2': s += '<path d="M30 16 L26 6 M50 16 L54 6" stroke="' + face + '" stroke-width="2.6" stroke-linecap="round"/><circle cx="26" cy="6" r="3" fill="#5ee0ff"/><circle cx="54" cy="6" r="3" fill="#5ee0ff"/>'; break;
      case 'ears': s += '<rect x="14" y="34" width="5" height="12" rx="2" fill="' + face + '"/><rect x="61" y="34" width="5" height="12" rx="2" fill="' + face + '"/>'; break;
      case 'dish': s += '<circle cx="40" cy="8" r="8" fill="none" stroke="' + face + '" stroke-width="2.4"/><circle cx="40" cy="8" r="3" fill="' + face + '"/>'; break;
      case 'hair': s += '<path d="M19 34 Q20 12 40 12 Q60 12 61 34 Q58 20 46 21 Q56 26 50 30 Q44 20 30 24 Q22 27 19 34 Z" fill="' + hair + '"/>'; break;
      case 'tuft': s += '<path d="M32 16 Q36 6 42 12 Q48 6 50 16 Q42 12 32 16 Z" fill="' + hair + '"/>'; break;
      case 'cap': s += '<path d="M20 26 Q22 12 40 12 Q58 12 60 26 Z" fill="' + body + '"/><rect x="16" y="24" width="48" height="5" rx="2.5" fill="' + body + '"/>'; break;
      case 'headband': s += '<rect x="19" y="22" width="42" height="6" rx="3" fill="' + body + '"/>'; break;
      case 'headphones': s += '<path d="M18 40 Q18 14 40 14 Q62 14 62 40" stroke="#2b2f36" stroke-width="4" fill="none"/><rect x="14" y="34" width="7" height="14" rx="3" fill="#2b2f36"/><rect x="59" y="34" width="7" height="14" rx="3" fill="#2b2f36"/>'; break;
      case 'bow': s += '<path d="M50 14 l8 -5 v10 z M50 14 l-2 -6 v12 z" fill="#ff7aa2"/><circle cx="50" cy="14" r="2.6" fill="#e0568a"/>'; break;
    }

    /* moustache pour certains humains */
    if (!robot && r() < 0.18) {
      s += '<path d="M32 ' + (mY - 3) + ' Q40 ' + (mY - 7) + ' 48 ' + (mY - 3) + ' Q40 ' + (mY - 1) + ' 32 ' + (mY - 3) + ' Z" fill="' + hair + '"/>';
    }
    /* boulons pour robots */
    if (robot) {
      s += '<circle cx="24" cy="20" r="1.6" fill="#6a7580"/><circle cx="56" cy="20" r="1.6" fill="#6a7580"/>' +
           '<circle cx="24" cy="54" r="1.6" fill="#6a7580"/><circle cx="56" cy="54" r="1.6" fill="#6a7580"/>';
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="' + size + '" height="' + size + '">' + s + '</svg>';
  }

  /* ---------- le roster ---------- */
  function B(id, name, rating, flag, robot, aggression, blurb) {
    return { id: id, name: name, rating: rating, flag: flag, robot: !!robot, aggression: aggression || 0, blurb: blurb || '' };
  }

  var GROUPS = [
    {
      id: 'ecole', title: "Le groupe de l'école", featured: true,
      bots: [
        B('cliff', 'Cliff - Triangle', 300, 'DE', false, 0, "Le stratège du triangle."),
        B('tobi', 'Tobi', 5, 'AT', false, 0, "Il découvre les pions."),
        B('lena', 'Lena', 10, 'DE', false, 0, "Aime beaucoup les dames."),
        B('max', 'Max', 15, 'NL', false, 0, "Joue pendant la récré."),
        B('emma', 'Emma', 20, 'BE', false, 0, "Championne de CE2."),
        B('finn', 'Finn', 30, 'DK', false, 0, "Le meilleur du groupe.")
      ]
    },
    {
      id: 'neophyte', title: 'Néophyte aux échecs',
      bots: [
        B('martin', 'Martin', 250, 'US', false, 0, "Papa de quatre enfants, apprend avec eux."),
        B('elani', 'Elani', 275, 'GR', false, 0, "Joue seulement avec les blancs."),
        B('pico', 'Pico', 300, 'BR', true, 0.2, "Petit robot, grandes ambitions."),
        B('juan', 'Juan', 350, 'MX', false, 0, "Adore les tacos et les fourchettes."),
        B('mia-bot', 'MIA-7', 400, 'JP', true, 0.3, "Unité d'entraînement v1.2.")
      ]
    },
    {
      id: 'debutant', title: 'Débutant',
      bots: [
        B('wally', 'Wally', 500, 'US', false, 0, "Champion de son bar."),
        B('mateo', 'Mateo', 550, 'AR', false, 0, "Apprend l'italienne."),
        B('elena-b', 'Elena', 575, 'RO', false, 0, "Joue dans le parc le dimanche."),
        B('wendy', 'Wendy', 600, 'GB', false, 0, "Ne lâche jamais sa dame."),
        B('jimmy', 'Jimmy', 600, 'US', false, 0.1, "Le pote de tout le monde."),
        B('omar', 'Omar', 625, 'EG', false, 0, "Spécialiste du coup bizarre."),
        B('kiril', 'Kiril', 650, 'BG', false, 0, "A lu un livre une fois."),
        B('nelson', 'Nelson', 700, 'PH', false, 0.1, "Attaque dès le premier coup."),
        B('isabel', 'Isabel', 700, 'PT', false, 0, "Défense philidor, toujours."),
        B('rusty', 'RUST-E', 725, 'US', true, 0.4, "Rouillé mais tenace."),
        B('oscar', 'Oscar', 750, 'SE', false, 0, "Roque toujours, partout."),
        B('antonio', 'Antonio', 750, 'ES', false, 0, "Ole ! Après chaque prise."),
        B('li', 'Li', 775, 'CN', false, 0, "Calcule lentement mais sûrement."),
        B('nikos', 'Nikos', 800, 'GR', false, 0, "Le tavernakis des échecs."),
        B('andre', 'André', 800, 'FR', false, 0, "Un petit gambit, ça vous dit ?")
      ]
    },
    {
      id: 'intermediaire', title: 'Intermédiaire',
      bots: [
        B('sara', 'Sara', 850, 'IL', false, 0.2, "Solide comme un roc."),
        B('coach-david', 'Coach David', 900, 'US', false, 0, "Vous donne des conseils... en jouant."),
        B('nora', 'Nora', 950, 'NO', false, 0, "Les fjords l'ont rendue patiente."),
        B('kenji', 'Kenji', 1000, 'JP', false, 0.3, "Précis comme un katana."),
        B('emir', 'Emir', 1050, 'TR', false, 0, "Le maître du backgammon s'y met."),
        B('noam', 'Noam', 1100, 'IL', false, 0, "Étudie les finales, sérieux."),
        B('sven', 'Sven', 1100, 'SE', false, 0.2, "Froid et calculateur."),
        B('lucia', 'Lucia', 1150, 'IT', false, 0, "L'italienne, naturellement."),
        B('clank', 'CLANK-9000', 1200, 'US', true, 0.6, "Surchauffe sur les sacrifices."),
        B('petra', 'Petra', 1250, 'CZ', false, 0, "Prague l'inspire."),
        B('yuri', 'Yuri', 1300, 'RU', false, 0.4, "École soviétique."),
        B('priya', 'Priya', 1350, 'IN', false, 0.2, "Vise le titre de maître."),
        B('hans', 'Hans', 1400, 'DE', false, 0, "Ordre et méthode."),
        B('marco', 'Marco', 1400, 'IT', false, 0.5, "Agressif comme un espresso."),
        B('viktor', 'Viktor', 1500, 'HU', false, 0.3, "Presque un vrai joueur de club.")
      ]
    },
    {
      id: 'avance', title: 'Avancé',
      bots: [
        B('anatoly', 'Anatoly', 1600, 'RU', false, 0.3, "A battu un maître une fois. En simul."),
        B('sonia', 'Sonia', 1650, 'FR', false, 0, "Nul ne passe sa sicilienne."),
        B('boris', 'Boris', 1700, 'RS', false, 0.5, "Attaque à tout prix."),
        B('pentala', 'Pentala', 1750, 'IN', false, 0, "Machine de précision."),
        B('mikhail', 'Mikhail', 1800, 'LV', false, 0.7, "La magie de Riga."),
        B('hou', 'Hou', 1850, 'CN', false, 0.2, "Universelle et dangereuse."),
        B('teimour', 'Teimour', 1900, 'AZ', false, 0.3, "Ne cède rien."),
        B('judit', 'Judit', 1900, 'HU', false, 0.6, "La légende de Budapest."),
        B('shak', 'Shakhriyar', 1950, 'AZ', false, 0.5, "Le tournoi est son terrain."),
        B('viswa', 'Viswanathan', 1950, 'IN', false, 0.2, "Le tigre de Madras."),
        B('ian', 'Ian', 1950, 'RU', false, 0, "La prépa avant tout."),
        B('levon', 'Levon', 2000, 'AM', false, 0.4, "Imprévisible et solide."),
        B('wesley', 'Wesley', 2050, 'US', false, 0, "L'homme au sourire."),
        B('ding', 'Ding', 2100, 'CN', false, 0.2, "Inébranlable."),
        B('alireza', 'Alireza', 2150, 'FR', false, 0.6, "Le prodige."),
        B('fabiano', 'Fabiano', 2200, 'US', false, 0.3, "Préparation militaire."),
        B('overclox', '0VERCL0X', 2250, 'KR', true, 0.8, "Fréquence : maximale."),
        B('magnus', 'Magnus', 2300, 'NO', false, 0.4, "Vous connaissez déjà la fin."),
        B('hikaru', 'Hikaru', 2400, 'US', false, 0.7, "En bullet, il est inarrêtable."),
        B('garry', 'Garry', 2500, 'RU', false, 0.8, "La légende de Baku.")
      ]
    }
  ];

  /* attacher les avatars */
  GROUPS.forEach(function (g) {
    g.bots.forEach(function (b) { b.avatar = avatarSVG(b, 80); });
  });

  /* ---------- répliques des bots ---------- */
  var LINES = {
    start: ["Bonne chance !", "C'est parti !", "Prêt ? On y va.", "Montre-moi ce que tu sais faire.", "Amuse-toi bien !"],
    botCapture: ["Je prends ça !", "Miam.", "Merci !", "Une pièce de plus.", "Hop, à moi."],
    userCapture: ["Aïe !", "Bien joué...", "Je l'avais pas vu.", "Tu me la rends ?"],
    botCheck: ["Échec !", "Attention à ton roi !", "Échec, ça commence."],
    userCheck: ["Oups.", "Pas mal !", "Je m'en sors."],
    win: ["Belle partie ! GG.", "Victoire ! Rejouons ?", "Bien essayé !"],
    lose: ["Bravo, bien joué !", "Tu m'as eu. Revanche ?", "Impressionnant !"],
    drawOk: ["D'accord, nulle.", "Oui, partageons le point.", "Accepté, belle partie."],
    drawNo: ["Non merci, je continue !", "Pas encore, la position m'intéresse.", "Je préfère jouer."],
    resign: ["Merci pour la partie !", "À la prochaine !"],
    think: ["Hmm...", "Intéressant...", "Voyons voir...", "Pas évident..."],
    flag: ["Le temps, c'est de l'argent.", "Trop lent !"]
  };

  var api = {
    GROUPS: GROUPS,
    LINES: LINES,
    line: function (k) { var a = LINES[k]; return a[Math.floor(Math.random() * a.length)]; },
    avatarSVG: avatarSVG,
    flagSVG: flagSVG,
    findBot: function (id) {
      for (var i = 0; i < GROUPS.length; i++) {
        for (var j = 0; j < GROUPS[i].bots.length; j++) {
          if (GROUPS[i].bots[j].id === id) return GROUPS[i].bots[j];
        }
      }
      return null;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CheeseBots = api;

})(typeof window !== 'undefined' ? window : globalThis);
