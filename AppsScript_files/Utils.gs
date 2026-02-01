// Utility per standardizzare URL


function normalizeWebsite(url_input) {
  if (url_input === null || url_input === undefined) return "";

  var text = String(url_input).trim();
  if (!text) return "";

  // Ignora link non web
  if (/^(mailto:|tel:|javascript:)/i.test(text)) return "";

  // URL senza schema: //example.com
  if (text.indexOf("//") === 0) text = "https:" + text;

  // Se manca lo schema, aggiunge https://
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)) text = "https://" + text;

  // Rimuove query/hash
  text = text.split("#")[0].split("?")[0];

  // Parsing robusto senza dipendere da URL() (non sempre disponibile in Apps Script).
  // Formato atteso: schema://host[:porta][/percorso]
  var match = text.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(.+)$/);
  if (!match) return "";

  var schema = (match[1] || "").toLowerCase();
  var resto = match[2] || "";

  // Se c'e' userinfo (user:pass@host), la scarta.
  var idxAt = resto.lastIndexOf("@");
  if (idxAt !== -1) resto = resto.slice(idxAt + 1);

  var idxSlash = resto.indexOf("/");
  var hostPorta = idxSlash === -1 ? resto : resto.slice(0, idxSlash);
  var percorso = idxSlash === -1 ? "" : resto.slice(idxSlash);

  // Normalizza path: rimuove trailing slash
  percorso = (percorso || "").replace(/\/+$/, "");

  var host = hostPorta;
  var porta = "";
  var idxDuePunti = hostPorta.lastIndexOf(":");
  if (idxDuePunti !== -1 && hostPorta.indexOf("]") === -1) {
    // Nota: non gestiamo IPv6 in questo prototipo.
    host = hostPorta.slice(0, idxDuePunti);
    porta = hostPorta.slice(idxDuePunti + 1);
  }

  host = String(host || "").toLowerCase().trim();
  if (!host) return "";
  if (host.indexOf("www.") === 0) host = host.slice(4);

  // Tiene la porta solo se non e' quella di default.
  var tieniPorta =
    porta &&
    !((schema === "https" && porta === "443") || (schema === "http" && porta === "80"));

  // Forza https nel "key" cosi' http/https dedupano.
  var protocollo = "https:";

  // Rimuove query/hash volutamente (gia' fatto sopra).
  return (
    protocollo +
    "//" +
    host +
    (tieniPorta ? ":" + porta : "") +
    percorso
  );
}

/**
 * Costruisce un Set di "website normalizzati" a partire dai valori del foglio.
 * @return {Set<string>}
 */
function buildWebsiteSet(valori, indiceColonnaWebsiteZeroBased) {
  var insieme = new Set();
  if (!valori || valori.length < 2) return insieme; // solo header o vuoto

  for (var riga = 1; riga < valori.length; riga++) {
    var website = valori[riga][indiceColonnaWebsiteZeroBased];
    var chiave = normalizeWebsite(website);
    if (chiave) insieme.add(chiave);
  }

  return insieme;
}

/**
 * True se la website (normalizzata) e' gia' presente nel Set.
 */
function isDuplicateWebsite(website, insiemeWebsite) {
  var chiave = normalizeWebsite(website);
  if (!chiave) return false;
  return insiemeWebsite.has(chiave);
}
