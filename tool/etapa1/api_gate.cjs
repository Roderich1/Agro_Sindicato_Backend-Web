// Compuerta del túnel de la etapa 1: sólo deja pasar rutas `/api/v1/...` hacia la API
// aislada. Cualquier otra (p. ej. `/docs`, Swagger) se responde 404 aquí, sin reenviarla.
// No registra cabeceras, cuerpos ni consultas. Los cuerpos (fotos) pasan como flujo.
//   node api_gate.cjs <puerto-escucha> <puerto-api>
const http = require("node:http");

const [listenPort, apiPort] = process.argv.slice(2).map(Number);
const ALLOWED = /^\/api\/v1\/[A-Za-z0-9/_.-]*$/;
// Fallo CONTROLADO para pruebas (E1, «datos publicados aunque falle la foto»): mientras
// exista el archivo marcador, `PUT …/photo` se responde aquí con el 503 que da la API sin
// almacenamiento de fotos, SIN reenviarlo. La respuesta es inyectada y así se documenta.
const PHOTO_FAIL = process.env.ET1_GATE_PHOTO_FAIL_FILE;
const PHOTO_PUT = /^\/api\/v1\/catalog\/identification-requests\/[0-9a-f-]{36}\/photo$/;

http
  .createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0];
    if (!ALLOWED.test(path) || path.includes("..")) {
      res.writeHead(404, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end('{"errorCode":"NOT_FOUND"}');
      req.resume();
      return;
    }
    if (PHOTO_FAIL && req.method === "PUT" && PHOTO_PUT.test(path) && require("node:fs").existsSync(PHOTO_FAIL)) {
      res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store", Connection: "close" });
      res.end('{"errorCode":"PHOTO_STORAGE_UNAVAILABLE"}');
      req.resume();
      console.log(`${new Date().toISOString()} INYECTADO 503 PUT /photo`);
      return;
    }
    const upstream = http.request(
      { host: "127.0.0.1", port: apiPort, method: req.method, path: req.url, headers: req.headers },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
      res.end('{"errorCode":"UPSTREAM_UNAVAILABLE"}');
    });
    req.pipe(upstream);
  })
  .listen(listenPort, "127.0.0.1");
