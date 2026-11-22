'use strict';
/**
 * Digital Ambush phone-honesty sanitizer.
 * Never publish a guessed, inherited, or unverified number.
 * verifiedPhone is ONLY provided after a business-matched public source is checked.
 * The review build defaults to showing no phone, not a clickable fake.
 */
function digits(s) { return String(s || '').replace(/\D/g, ''); }
function sanitise(html, verifiedPhone = '') {
  if (typeof html !== 'string') throw new TypeError('HTML source required');
  const approved = digits(verifiedPhone);
  if (approved && !/^(?:0\d{9,10}|44\d{9,10})$/.test(approved)) throw new Error('Invalid verified UK phone');
  let out = html;
  // Any telephone link must match the explicitly source-verified number.
  out = out.replace(/<a\b[^>]*\bhref\s*=\s*(["'])tel:[^"']*\1[^>]*>[\s\S]*?<\/a>/gi, (tag) => {
    const href = tag.match(/\bhref\s*=\s*["']tel:([^"']+)/i);
    const value = digits(href && href[1]);
    const ok = approved && (value === approved || value.replace(/^44/, '0') === approved.replace(/^44/, '0'));
    if (!ok) return '<span class="phone-unverified" aria-label="Phone number not confirmed">Phone number not confirmed</span>';
    // An honest clickable CTA may have a stale visible number. Replace it.
    const shown = approved.startsWith('44') ? '0' + approved.slice(2) : approved;
    return tag.replace(/>[^<>]*?\b(?:0\d[\d\s()\-]{8,16}|\+44[\d\s()\-]{8,16})\b[^<>]*?</g, '>' + shown + '<');
  });
  // Prevent stale telephone schema/structured data being indexed.
  out = out.replace(/("telephone"\s*:\s*)"(?:\\.|[^"])*"/gi, (_m, prefix) => prefix + (approved ? JSON.stringify(verifiedPhone) : 'null'));
  const ukPhone = /(?<![A-Za-z0-9])(?:\+44\s?(?:\(0\)\s?)?|0)(?:\d[\s()\-]?){9,10}(?!\d)/g;
  // Mask standalone displayed phone strings, but never alter CSS/JS source.
  out = out.replace(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)|>([^<>]*)</gi, (whole, block, visible) => {
    if (block) return block;
    if (!visible || !ukPhone.test(visible)) { ukPhone.lastIndex = 0; return whole; }
    ukPhone.lastIndex = 0;
    const replaced = visible.replace(ukPhone, n => {
      const d = digits(n);
      if (approved && (d === approved || d.replace(/^44/, '0') === approved.replace(/^44/, '0'))) return n;
      return 'Phone number not confirmed';
    });
    return '>' + replaced + '<';
  });
  // The shared sample/placeholder number was also present in raw metadata.
  for (const raw of ['01215567820', '0121 556 7820', '07809 444321', '07809444321']) {
    if (!approved || digits(raw) !== approved) out = out.split(raw).join('Phone number not confirmed');
  }
  if (!approved) {
    // Attribute values may already contain the text mask from the visible-text
    // pass, so strip unverified phone attributes regardless of their value.
    out = out.replace(/\s(?:data-phone|data-telephone)=(["'])[^"']*\1/gi, '');
    out = out.replace(/\scontent=(["'])(?:\+44|0\d)[\d\s()\-]{8,16}\1/gi, '');
  }
  if (/href\s*=\s*["']tel:/i.test(out) && !approved) throw new Error('PHONE_GATE_FAIL: Unverified tel link remains');
  if (/0121(?:\s|&nbsp;)*556(?:\s|&nbsp;)*7820|07809(?:\s|&nbsp;)*444321/i.test(out) && (!approved || !['01215567820','07809444321'].includes(approved))) throw new Error('PHONE_GATE_FAIL: Stock number leaked');
  return out;
}
module.exports = { sanitise };
