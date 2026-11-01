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

De Wikimedia Commons, rasterizadas a 360×240 con `npm run flags`.

| Provincia | Archivo | Autor | Licencia |
| --- | --- | --- | --- |
| Álava | [Flag of Álava.svg](https://commons.wikimedia.org/wiki/File:Flag_of_%C3%81lava.svg) | HansenBCN | CC BY-SA 4.0 |
| Albacete | [Bandera provincia Albacete.svg](https://commons.wikimedia.org/wiki/File:Bandera_provincia_Albacete.svg) | Espanish AlB; SanchoPanzaXXI; HansenBCN | CC BY-SA 4.0 |
| Almería | [Flag Almería Province.svg](https://commons.wikimedia.org/wiki/File:Flag_Almer%C3%ADa_Province.svg) | Almju | CC BY-SA 4.0 |
| Ávila | [Bandera de la provincia de Ávila.svg](https://commons.wikimedia.org/wiki/File:Bandera_de_la_provincia_de_%C3%81vila.svg) | Rastrojo (D•ES) | CC BY-SA 4.0 |
| Badajoz | [Provincia de Badajoz - Bandera.svg](https://commons.wikimedia.org/wiki/File:Provincia_de_Badajoz_-_Bandera.svg) | HansenBCN | CC BY-SA 3.0 |
| Barcelona | [Flag of Barcelona (province).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Barcelona_(province).svg) | — | CC BY-SA 3.0 |
| Burgos | [Flag Burgos Province.svg](https://commons.wikimedia.org/wiki/File:Flag_Burgos_Province.svg) | HansenBCN | CC BY-SA 4.0 |
| Cáceres | [Flag of the province of Cáceres.svg](https://commons.wikimedia.org/wiki/File:Flag_of_the_province_of_C%C3%A1ceres.svg) | Ewan ar Born, Rastrojo and Offnfopt | CC BY-SA 3.0 |
| Cádiz | [Flag Cádiz Province.svg](https://commons.wikimedia.org/wiki/File:Flag_C%C3%A1diz_Province.svg) | Ulaidh | CC BY-SA 4.0 |
| Ciudad Real | [Flag Ciudad Real Province.svg](https://commons.wikimedia.org/wiki/File:Flag_Ciudad_Real_Province.svg) | Ulaidh | CC BY-SA 4.0 |
| Córdoba | [Provincia de Córdoba - Bandera.svg](https://commons.wikimedia.org/wiki/File:Provincia_de_C%C3%B3rdoba_-_Bandera.svg) | HansenBCN | CC BY-SA 3.0 |
| Valladolid | [Bandera de la provincia de Valladolid.svg](https://commons.wikimedia.org/wiki/File:Bandera_de_la_provincia_de_Valladolid.svg) | Original: Vexilla Hispanica. Vectorization: Chabacano | CC BY-SA 3.0 |
