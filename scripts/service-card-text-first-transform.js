/**
 * Digital Ambush text-first service card repair, 2026-11-22.
 * Deterministic repair of existing, business-specific prospect HTML.
 * Does not invent accreditations, prices, testimonials, results or services.
 * The card's existing verified heading and description remain authoritative.
 * Future builders should produce full original copy; this is a repair pass.
 */
function transformProspectCardHtml(source) {
  if (typeof source !== "string" || !source.includes("</html>")) {
    throw new Error("EXPECTED_COMPLETE_HTML_DOCUMENT");
  }
  const plain = value => String(value || "")
    .replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&")
    .replace(/&(?:nbsp|#160);/g, " ").replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&ndash;|&mdash;/g, "-")
    .replace(/\s+/g, " ").trim();
  const topics = [
    [/radiator|heating system|central heating|thermostat/i,
      "Cold spots, uneven room temperatures, noisy pipework and systems that take too long to warm up can have different causes. Note which rooms are affected and when the symptoms happen so the next discussion can focus on sensible checks, options for improving comfort and the practical work involved."],
    [/boiler|gas fire|heat pump/i,
      "If a heating appliance needs attention, note any fault codes, changes in pressure, unusual noises and interruptions to heating or hot water. These details are helpful when discussing what should be checked first, whether repair is appropriate and what to consider before upgrading equipment."],
    [/plaster|skimming|render|coving|patch repair|drywall|board/i,
      "The existing surface, its condition and the finish you want are important details for this work. Share photos, approximate dimensions and any signs of cracks, damp or previous repairs so the preparation, edges, materials and expected finish can be discussed before work begins."],
    [/roof|gutter|fascia|soffit|chimney|flashing|ridge tile/i,
      "Visible water damage or a loose covering is not always where the problem began. Roof coverings, joints, flashing and drainage may all need consideration. Note which area is affected and when the issue occurs so an inspection can focus on the likely causes and sensible repair options."],
    [/patio|pav|driveway|deck|fenc|garden|landscap|turf|groundwork|artificial grass/i,
      "For an outdoor project, think beyond the visible finish. Levels, drainage, ground preparation, access and how the finished space will be used can all influence the plan. Dimensions, photographs and preferred materials help make it easier to compare practical options before any work starts."],
    [/electri|rewir|light|socket|solar|fuse|ev charg|consumer unit/i,
      "The current installation, where the equipment will sit and how it will be used all matter. Describe any faults, recent changes or additional requirements and ask what access, testing and safety checks may be needed before the options and scope of work are agreed."],
    [/kitchen|bathroom|shower|wet room|til|flooring|ensuite/i,
      "A finished room needs to work as well as it looks. Measurements, existing surfaces, preferred materials and details such as storage, lighting, ventilation and cleaning all deserve attention. Photos and a short list of priorities can help shape a practical layout and a clear scope."],
    [/carpentr|joiner|wood|door|window|stair|bespoke|cabinet|wardrobe/i,
      "Accurate measurements, the existing structure and finishing details matter when planning fitted work. Pictures of the space and examples of your preferred style help clarify materials, access, how different parts should meet and what will feel right in everyday use."],
    [/paint|decorat|wallpaper|spray finish/i,
      "Preparation is just as important as the finished colour. The condition of the surface, old coatings, necessary repairs and the finish you have in mind all influence the approach. Share photos and the size of the area so the likely preparation and material choices can be discussed."],
    [/plumb|leak|tap|pipe|drain|water|toilet|sink|bath/i,
      "Leaks, drainage problems and changes in water pressure can have different causes even when the symptoms look similar. A photograph of the fitting, any visible damage and a description of when the issue happens help clarify what needs checking and which repair options to discuss."],
    [/brick|build|extension|renovat|conversion|structural|property maintenance|refurbish/i,
      "The existing condition, access, site layout and intended result all deserve consideration at the planning stage. Measurements, photos and a clear outline of the work can help clarify the sequence, materials and finishing tasks, rather than leaving important details until the job is underway."],
    [/clean|wash|pressure|valet/i,
      "The surface type, condition, size and difficult-to-reach areas influence what preparation may be needed. Photos and basic measurements help frame a useful conversation about the appropriate method, practical access and the result the property needs."],
    [/install|repair|maintenance|service/i,
      "A useful starting point is a clear picture of the existing condition and what needs to change. Photos, approximate measurements and a short description of the problem help narrow the options and make it easier to discuss the work, access and preparation before making a decision."]
  ];
  let cards = 0, expanded = 0, weakWithoutParagraph = 0;
  const cardsPattern = /<article\b[^>]*class=["'][^"']*\bservice-card\b[^"']*["'][^>]*>[\s\S]*?<\/article>/gi;
  let html = source.replace(cardsPattern, card => {
    cards++;
    if (/class=["'][^"']*service-detail/.test(card)) return card;
    const heading = card.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
    if (!heading) { weakWithoutParagraph++; return card; }
    const title = plain(heading[1]);
    const headingEnd = card.indexOf(heading[0]) + heading[0].length;
    const rest = card.slice(headingEnd);
    const match = rest.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    if (!match) { weakWithoutParagraph++; return card; }
    const existing = plain(match[1]), words = existing.split(/\s+/).filter(Boolean).length;
    if (words >= 65) return card;
    const rule = topics.find(([pattern]) => pattern.test(title));
    const listed = [...card.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .map(m => plain(m[1])).filter(t => t && t.length <= 65);
    const extra = rule ? rule[1] : listed.length
      ? "The services described here include " + listed.slice(0, 3).join(", ") +
        ". It is worth discussing the condition of the space, access, materials and the result you want so the likely scope and the next practical steps are clear."
      : "Before choosing an approach, consider the existing condition, access and the result you want to achieve. Clear photos and rough measurements can help make the initial discussion more useful, covering preparation, materials, any constraints and the practical next steps.";
    // Add service-specific useful information rather than invented customer claims.
    const fullP = match[0], at = headingEnd + rest.indexOf(fullP);
    if (at < headingEnd) { weakWithoutParagraph++; return card; }
    expanded++;
    return card.slice(0, at + fullP.length) +
      '\n          <p class="service-detail">' + extra + "</p>" +
      card.slice(at + fullP.length);
  });
  const linked = /founder-visual-v3\.css/i.test(html);
  if (linked) {
    html = html.replace(/founder-visual-v3\.css(?:\?v=[^"'\s<>]*)?/gi,
      "founder-visual-v3.css?v=20261122-5");
  } else {
    html = html.replace(/<\/head>/i,
      '<link rel="stylesheet" href="../founder-visual-v3.css?v=20261122-5" data-founder-v3="true">\n</head>');
  }
  if (!html.includes("founder-visual-v3.css?v=20261122-5") ||
      html.length < source.length - 100 || !html.includes("</html>")) {
    throw new Error("TRANSFORM_VERIFICATION_FAILED");
  }
  return { content: html, cards, expanded, weakWithoutParagraph, linked,
    changed: html !== source };
}
