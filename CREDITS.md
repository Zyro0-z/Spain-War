# Créditos y licencias

| Recurso | Origen | Licencia |
| --- | --- | --- |
| Límites provinciales | [Instituto Geográfico Nacional](https://www.ign.es) (Equipamiento Geográfico de Referencia Nacional), vía [es-atlas](https://github.com/martgnz/es-atlas) 0.6.0 | Datos: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · es-atlas: MIT |
| Países vecinos (Portugal, Francia, Andorra, Marruecos, Argelia) | [Natural Earth](https://www.naturalearthdata.com) 1:10m, vía [world-atlas](https://github.com/topojson/world-atlas) 2.0.2 | Dominio público · world-atlas: ISC |
| Tipografía Barlow Condensed | [The Barlow Project Authors](https://github.com/jpt/barlow), autoalojada en `fonts/` | [SIL Open Font License 1.1](fonts/OFL.txt) |
| Escudos, iconos, ruleta, dados, ilustraciones y sonidos | Hechos para esta app (SVG, canvas y WebAudio) | Los del propio proyecto |

`data/map.json` se genera con `npm run build:map` (d3-geo, topojson-client y topojson-simplify, solo en desarrollo). Los paquetes de datos se descargan del registro de npm y se comprueban con su hash.

## Escudos

Los escudos son heráldica procedural: campo del color del bando, una partición heráldica (partido, cortado, cuartelado, banda, jefe, cabrio, aspa o bordura componada), bordura de oro, corona real y la matrícula provincial como monograma.

Los escudos oficiales de Wikimedia Commons no están incluidos: el entorno en el que se ha construido esta versión no tiene acceso a commons.wikimedia.org ni a upload.wikimedia.org, así que no se ha podido descargar ni comprobar la licencia de cada archivo.
