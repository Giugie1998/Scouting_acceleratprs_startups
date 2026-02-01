function generaValuePropositionMancantiLLM_(opzioni) {
  var maxStartups = (opzioni && opzioni.maxStartups) || 20;
  var sleepMs = (opzioni && opzioni.sleepMs) || 250;

  var run = creaRun_("vp");
  var cfg = validaSegretiLLM_();

  var scheda = getScheda_("startups");
  var valori = leggiValori_(scheda);
  if (!valori || valori.length < 2) {
    SpreadsheetApp.getUi().alert("Nessuna startup trovata in 'startups'.");
    return;
  }

  var header = valori[0];
  var idxWebsite = trovaIndiceColonna_(header, "website");
  var idxName = trovaIndiceColonna_(header, "name");
  var idxValue = trovaIndiceColonna_(header, "value_proposition");
  if (idxWebsite === -1 || idxValue === -1) {
    throw new Error("In 'startups' servono almeno colonne: website, value_proposition");
  }

  for (var r = 1; r < valori.length; r++) {
    if ((run.contatori.processati || 0) >= maxStartups) break;

    var website = String(valori[r][idxWebsite] || "").trim();
    var name = idxName !== -1 ? String(valori[r][idxName] || "").trim() : "";
    var value = String(valori[r][idxValue] || "").trim();

    if (!website) {
      run.inc("skippati");
      continue;
    }
    if (value) {
      run.inc("skippati");
      continue;
    }

    run.inc("processati");

    var contenuto = estraiContenutoSitoPerPrompt_(website);
    if (!contenuto.testo) {
      run.inc("errori");
      run.warn("SKIP contenuto vuoto website=%s", website);
      continue;
    }

    var proposta = "";
    try {
      proposta = generaValuePropositionConRetry_({
        apiKey: cfg.apiKey,
        apiUrl: cfg.apiUrl,
        modello: cfg.modello,
        openrouterReferer: cfg.openrouterReferer,
        openrouterTitle: cfg.openrouterTitle,
        nomeStartup: name,
        website: website,
        contenuto: contenuto,
      });
    } catch (e) {
      run.inc("errori");
      run.error(
        "errore LLM website=%s err=%s",
        website,
        e && e.message ? e.message : e
      );
      continue;
    }

    if (!proposta) {
      run.inc("errori");
      run.warn("SKIP proposta vuota website=%s", website);
      continue;
    }

    scheda.getRange(r + 1, idxValue + 1).setValue(proposta);
    run.inc("generate");
    run.info("OK website=%s vp=%s", website, proposta);

    Utilities.sleep(sleepMs);
  }

  run.alert("Genera value proposition");
}

function estraiContenutoSitoPerPrompt_(website) {
  // Usa fetchHtml_ gia' presente (ScoutingStartups.gs). Se non hai quel file nel progetto, copialo anche.
  var base = normalizeWebsite(website);
  if (!base) return { url: website, testo: "" };

  var ris = fetchHtml_(base);
  if (!ris.ok) {
    // fallback leggero: prova /about
    var risAbout = fetchHtml_(base + "/about");
    if (!risAbout.ok) return { url: base, testo: "" };
    return { url: base + "/about", testo: estraiTestoDaHtml_(risAbout.html) };
  }

  var testo = estraiTestoDaHtml_(ris.html);
  if (testo) return { url: base, testo: testo };

  // fallback: prova /about se homepage e' troppo "vuota"
  var ris2 = fetchHtml_(base + "/about");
  if (!ris2.ok) return { url: base, testo: "" };
  return { url: base + "/about", testo: estraiTestoDaHtml_(ris2.html) };
}

function estraiTestoDaHtml_(html) {
  if (!html) return "";

  var titolo = "";
  var descr = "";

  var mTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (mTitle) titolo = pulisciTesto_((mTitle[1] || "").trim());

  var mDesc = html.match(
    /<meta[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>/i
  );
  if (mDesc) descr = pulisciTesto_((mDesc[1] || "").trim());

  // Prende qualche pezzo (h1/h2/p) per dare contesto all'LLM.
  var blocchi = [];
  var re = /<(h1|h2|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  var match;
  while ((match = re.exec(html)) && blocchi.length < 20) {
    var testo = pulisciTesto_(match[2] || "");
    if (testo && testo.length >= 30) blocchi.push(testo);
  }

  var out = "";
  if (titolo) out += "Titolo: " + titolo + "\n";
  if (descr) out += "Descrizione: " + descr + "\n";
  if (blocchi.length) out += "Testo:\n- " + blocchi.join("\n- ") + "\n";

  // Limite hard per prompt.
  if (out.length > 6000) out = out.slice(0, 6000);
  return out.trim();
}

function pulisciTesto_(s) {
  var t = String(s || "");
  t = t.replace(/<[^>]+>/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function generaValuePropositionConRetry_(input) {
  var proposta = chiamaLLMValueProposition_(input, { retry: 0 });
  if (validaValueProposition_(proposta)) return proposta;

  // Retry leggero: prompt piu' rigido.
  proposta = chiamaLLMValueProposition_(input, { retry: 1 });
  if (validaValueProposition_(proposta)) return proposta;

  // Fallback: se proprio fallisce, prova a costruire una frase grezza dal testo.
  var fallback = fallbackValueProposition_(input.nomeStartup, input.website);
  return validaValueProposition_(fallback) ? fallback : "";
}

function validaValueProposition_(testo) {
  if (!testo) return false;
  var s = String(testo).trim();
  if (s.length < 25) return false;
  if (s.length > 220) return false;
  if (!/^Startup\s+/i.test(s)) return false;
  if (!/\shelps\s/i.test(s)) return false;
  if (!/\sso that\s/i.test(s)) return false;
  // Evita output multi-line
  if (/\n/.test(s)) return false;
  return true;
}

function fallbackValueProposition_(nomeStartup, website) {
  var nome = nomeStartup && String(nomeStartup).trim();
  if (!nome) nome = dominioDaUrl_(website) || "This startup";
  return (
    "Startup " +
    nome +
    " helps customers do their work more efficiently so that they can achieve better results."
  );
}

function chiamaLLMValueProposition_(input, opzioni) {
  var retry = (opzioni && opzioni.retry) || 0;

  var nome = (input.nomeStartup || "").trim();
  if (!nome) nome = dominioDaUrl_(input.website) || "X";

  var prompt =
    "Genera UNA SOLA frase (una riga) in inglese, esattamente con questo schema:\n" +
    "Startup <X> helps <Target Y> do <What W> so that <Benefit Z>\n\n" +
    "Regole:\n" +
    "- Non usare punti elenco.\n" +
    "- Non aggiungere testo extra prima o dopo.\n" +
    "- Non usare virgolette.\n" +
    "- Usa il nome startup come X: " +
    nome +
    "\n";

  if (retry === 1) {
    prompt +=
      "- Se non sei sicuro, fai assunzioni conservative, ma rispetta SEMPRE lo schema.\n";
  }

  prompt += "\nContesto dal sito (" + input.contenuto.url + "):\n" + input.contenuto.testo;

  var apiUrl = String(input.apiUrl || "").trim();
  var apiKey = String(input.apiKey || "").trim();
  if (!apiUrl) throw new Error("LLM_API_URL mancante");
  if (!apiKey) throw new Error("LLM_API_KEY mancante");

  var res;
  if (/generativelanguage\.googleapis\.com/i.test(apiUrl)) {
    // Gemini REST API (generateContent).
    var payloadGemini = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 120,
      },
    };

    res = UrlFetchApp.fetch(apiUrl, {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      headers: {
        "x-goog-api-key": apiKey,
      },
      payload: JSON.stringify(payloadGemini),
    });
  } else {
    // Compatibilita' OpenAI-style (chat/completions).
    var payloadOpenAI = {
      model: input.modello,
      messages: [
        { role: "system", content: "You write concise, factual value propositions." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    };

    var headers = {
      Authorization: "Bearer " + apiKey,
    };
    // Header consigliati da OpenRouter (opzionali).
    if (input.openrouterReferer) headers["HTTP-Referer"] = String(input.openrouterReferer);
    if (input.openrouterTitle) headers["X-Title"] = String(input.openrouterTitle);

    res = UrlFetchApp.fetch(apiUrl, {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      headers: headers,
      payload: JSON.stringify(payloadOpenAI),
    });
  }

  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    var body = res.getContentText() || "";
    if (body.length > 800) body = body.slice(0, 800);
    throw new Error("LLM HTTP " + code + " - " + body);
  }

  var json = {};
  try {
    json = JSON.parse(res.getContentText() || "{}");
  } catch (e) {
    throw new Error("Risposta LLM non JSON");
  }

  // Gemini
  if (/generativelanguage\.googleapis\.com/i.test(apiUrl)) {
    var parts =
      json &&
      json.candidates &&
      json.candidates[0] &&
      json.candidates[0].content &&
      json.candidates[0].content.parts;

    if (!parts || !parts.length) return "";
    var out = "";
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] && parts[i].text) out += String(parts[i].text);
    }
    return out.trim();
  }

  // OpenAI-style
  var testo =
    json &&
    json.choices &&
    json.choices[0] &&
    json.choices[0].message &&
    json.choices[0].message.content;

  return testo ? String(testo).trim() : "";
}
