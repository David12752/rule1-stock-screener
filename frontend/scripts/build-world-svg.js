const fs = require("fs");
const path = require("path");
const topojson = require("topojson-client");

const topo = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../public/maps/countries-110m.json"), "utf8")
);
const geo = topojson.feature(topo, topo.objects.countries);

function project(lon, lat) {
  const x = ((lon + 180) / 360) * 1000;
  const y = ((90 - lat) / 180) * 500;
  return [x, y];
}

function ringToPath(ring) {
  return (
    ring
      .map((c, i) => {
        const [x, y] = project(c[0], c[1]);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join("") + "Z"
  );
}

function geomToPath(g) {
  if (!g) return "";
  if (g.type === "Polygon") return g.coordinates.map(ringToPath).join("");
  if (g.type === "MultiPolygon")
    return g.coordinates.map((poly) => poly.map(ringToPath).join("")).join("");
  return "";
}

const pathEls = geo.features
  .map((f) => {
    const d = geomToPath(f.geometry);
    if (!d) return "";
    return `  <path d="${d}"/>`;
  })
  .filter(Boolean)
  .join("\n");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500">
${pathEls}
</svg>
`;

const out = path.join(__dirname, "../public/maps/world-110m.svg");
fs.writeFileSync(out, svg);
console.log("wrote", out, "bytes", svg.length, "paths", geo.features.length);
