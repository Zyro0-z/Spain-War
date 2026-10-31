# Créditos y licencias

| Recurso | Origen | Licencia |
| --- | --- | --- |
| Límites provinciales | [Instituto Geográfico Nacional](https://www.ign.es) (Equipamiento Geográfico de Referencia Nacional), vía [es-atlas](https://github.com/martgnz/es-atlas) 0.6.0 | Datos: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · es-atlas: MIT |
| Países vecinos (Portugal, Francia, Andorra, Marruecos, Argelia) | [Natural Earth](https://www.naturalearthdata.com) 1:10m, vía [world-atlas](https://github.com/topojson/world-atlas) 2.0.2 | Dominio público · world-atlas: ISC |
| Tipografía Barlow Condensed | [The Barlow Project Authors](https://github.com/jpt/barlow), autoalojada en `fonts/` | [SIL Open Font License 1.1](fonts/OFL.txt) |
| Banderas de las provincias | Wikimedia Commons (ver la tabla de abajo cuando estén descargadas) | La de cada archivo |
| Iconos, ruleta, dados, QR, ilustraciones y sonidos | Hechos para esta app (SVG, canvas y WebAudio) | Los del propio proyecto |

`data/map.json` se genera con `npm run build:map` (d3-geo, topojson-client y topojson-simplify, solo en desarrollo). Los paquetes de datos se descargan del registro de npm y se comprueban con su hash.

## Banderas

Cada bando lleva la bandera de su provincia. `npm run flags` (o, en GitHub, Actions › Banderas › Run workflow) toma la bandera de cada provincia de Wikidata (propiedad P41, por su código ISO 3166-2), comprueba en Commons que la licencia sea libre (dominio público, CC0, CC BY o CC BY-SA), la guarda en `data/flags/` y añade aquí autor y licencia de cada una.

Mientras no estén descargadas, la app muestra una tela provisional con el color del bando y la matrícula.
