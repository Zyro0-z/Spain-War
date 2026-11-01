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
| Alicante | [Flag maritime alicante.svg](https://commons.wikimedia.org/wiki/File:Flag_maritime_alicante.svg) | No machine-readable author provided. Banderas assumed (based on copyright claims). | Public domain |
| Almería | [Flag Almería Province.svg](https://commons.wikimedia.org/wiki/File:Flag_Almer%C3%ADa_Province.svg) | Almju | CC BY-SA 4.0 |
| Ávila | [Bandera de la provincia de Ávila.svg](https://commons.wikimedia.org/wiki/File:Bandera_de_la_provincia_de_%C3%81vila.svg) | Rastrojo (D•ES) | CC BY-SA 4.0 |
| Badajoz | [Provincia de Badajoz - Bandera.svg](https://commons.wikimedia.org/wiki/File:Provincia_de_Badajoz_-_Bandera.svg) | HansenBCN | CC BY-SA 3.0 |
| Barcelona | [Flag of Barcelona (province).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Barcelona_(province).svg) | — | CC BY-SA 3.0 |
| Burgos | [Flag Burgos Province.svg](https://commons.wikimedia.org/wiki/File:Flag_Burgos_Province.svg) | HansenBCN | CC BY-SA 4.0 |
| Cáceres | [Flag of the province of Cáceres.svg](https://commons.wikimedia.org/wiki/File:Flag_of_the_province_of_C%C3%A1ceres.svg) | Ewan ar Born, Rastrojo and Offnfopt | CC BY-SA 3.0 |
| Cádiz | [Flag Cádiz Province.svg](https://commons.wikimedia.org/wiki/File:Flag_C%C3%A1diz_Province.svg) | Ulaidh | CC BY-SA 4.0 |
| Ciudad Real | [Flag Ciudad Real Province.svg](https://commons.wikimedia.org/wiki/File:Flag_Ciudad_Real_Province.svg) | Ulaidh | CC BY-SA 4.0 |
| Córdoba | [Provincia de Córdoba - Bandera.svg](https://commons.wikimedia.org/wiki/File:Provincia_de_C%C3%B3rdoba_-_Bandera.svg) | HansenBCN | CC BY-SA 3.0 |
| Cuenca | [Flag Cuenca Province.svg](https://commons.wikimedia.org/wiki/File:Flag_Cuenca_Province.svg) | HansenBCN | CC BY-SA 4.0 |
| Girona | [Bandera de la provincia de Gerona.png](https://commons.wikimedia.org/wiki/File:Bandera_de_la_provincia_de_Gerona.png) | Realizado por Eduardo Panizo Gómez y extraído, con su consentimiento, de su página web Vexilla Hispánica, de dirección h | CC BY-SA 3.0 |
| Granada | [Bandera de la provincia de Granada (España).svg](https://commons.wikimedia.org/wiki/File:Bandera_de_la_provincia_de_Granada_(Espa%C3%B1a).svg) | Erlenmeyer | CC BY-SA 3.0 |
| Guadalajara | [Bandera de la Provincia de Guadalajara.svg](https://commons.wikimedia.org/wiki/File:Bandera_de_la_Provincia_de_Guadalajara.svg) | David Ll L | CC BY-SA 4.0 |
| Gipuzkoa | [Flag of Guipúzcoa.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Guip%C3%BAzcoa.svg) | HansenBCN | CC BY-SA 4.0 |
| Huelva | [Bandera de la Provincia De Huelva.svg](https://commons.wikimedia.org/wiki/File:Bandera_de_la_Provincia_De_Huelva.svg) | — | CC BY-SA 3.0 |
| Huesca | [Flag of Huesca (province).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Huesca_(province).svg) | Willtron | CC BY-SA 3.0 |
| Jaén | [Bandera de la provincia de Jaén.svg](https://commons.wikimedia.org/wiki/File:Bandera_de_la_provincia_de_Ja%C3%A9n.svg) | User:Juancharlie | CC BY 2.5 |
| León | [Bandera de León.svg](https://commons.wikimedia.org/wiki/File:Bandera_de_Le%C3%B3n.svg) | jgaray | Public domain |
| Lleida | [Bandera antiga de la província de Lleida.svg](https://commons.wikimedia.org/wiki/File:Bandera_antiga_de_la_prov%C3%ADncia_de_Lleida.svg) | HansenBCN | CC BY-SA 3.0 |
| La Rioja | [Flag of La Rioja (with coat of arms).svg](https://commons.wikimedia.org/wiki/File:Flag_of_La_Rioja_(with_coat_of_arms).svg) | jynus | CC BY 2.5 |
| Lugo | [Flag of Lugo province.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Lugo_province.svg) | Ulaidh | CC BY-SA 4.0 |
| Madrid | [Bandera de la Provincia de Madrid hasta 1983.svg](https://commons.wikimedia.org/wiki/File:Bandera_de_la_Provincia_de_Madrid_hasta_1983.svg) | HansenBCN | CC BY-SA 4.0 |
| Málaga | [Flag Málaga Province.svg](https://commons.wikimedia.org/wiki/File:Flag_M%C3%A1laga_Province.svg) | HansenBCN | CC BY-SA 4.0 |
| Murcia | [Bandera de la Diputación Provincial de Murcia.svg](https://commons.wikimedia.org/wiki/File:Bandera_de_la_Diputaci%C3%B3n_Provincial_de_Murcia.svg) | HansenBCN | CC BY-SA 3.0 |
| Navarra | [Bandera de Navarra.svg](https://commons.wikimedia.org/wiki/File:Bandera_de_Navarra.svg) | Miguillen | Public domain |
| Ourense | [Provincia de Ourense - Bandera.svg](https://commons.wikimedia.org/wiki/File:Provincia_de_Ourense_-_Bandera.svg) | HansenBCN | CC BY-SA 3.0 |
| Asturias | [Flag of Asturias (gala).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Asturias_(gala).svg) | HansenBCN | CC BY-SA 3.0 |
| Palencia | [Bandera de la provincia de Palencia1.svg](https://commons.wikimedia.org/wiki/File:Bandera_de_la_provincia_de_Palencia1.svg) | HansenBCN | CC BY-SA 4.0 |
| Pontevedra | [Flag Pontevedra Province.svg](https://commons.wikimedia.org/wiki/File:Flag_Pontevedra_Province.svg) | HansenBCN | CC BY-SA 4.0 |
| Salamanca | [Bandera de la provincia de Salamanca.svg](https://commons.wikimedia.org/wiki/File:Bandera_de_la_provincia_de_Salamanca.svg) | HansenBCN | CC BY-SA 3.0 |
| Cantabria | [Flag of Cantabria (Official).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Cantabria_(Official).svg) | Miguillen | CC BY-SA 2.5 |
| Segovia | [Flag Segovia province.svg](https://commons.wikimedia.org/wiki/File:Flag_Segovia_province.svg) | HansenBCN | CC BY-SA 4.0 |
| Sevilla | [Flag of Diputacion de Sevilla Spain.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Diputacion_de_Sevilla_Spain.svg) | Apj (Taller de Heráldica y Vexilología in the Spanish Wikipedia ) | CC BY-SA 4.0 |
| Soria | [Flag Soria province.svg](https://commons.wikimedia.org/wiki/File:Flag_Soria_province.svg) | HansenBCN | CC BY-SA 4.0 |
| Tarragona | [Bandera actual de la provincia de Tarragona (alternate).svg](https://commons.wikimedia.org/wiki/File:Bandera_actual_de_la_provincia_de_Tarragona_(alternate).svg) | Original version by HansenBCN | CC BY-SA 3.0 |
| Teruel | [Flag of Teruel (province).svg](https://commons.wikimedia.org/wiki/File:Flag_of_Teruel_(province).svg) | HansenBCN | CC BY-SA 4.0 |
| Toledo | [Bandera de la provincia de Toledo.svg](https://commons.wikimedia.org/wiki/File:Bandera_de_la_provincia_de_Toledo.svg) | Asqueladd | CC BY-SA 3.0 |
| Valencia | [Flag of the Land of Valencia (official).svg](https://commons.wikimedia.org/wiki/File:Flag_of_the_Land_of_Valencia_(official).svg) | Mutxamel | Public domain |
| Valladolid | [Bandera de la provincia de Valladolid.svg](https://commons.wikimedia.org/wiki/File:Bandera_de_la_provincia_de_Valladolid.svg) | Original: Vexilla Hispanica. Vectorization: Chabacano | CC BY-SA 3.0 |
| Bizkaia | [Bandera de Vizcaya.svg](https://commons.wikimedia.org/wiki/File:Bandera_de_Vizcaya.svg) | SanchoPanzaXXI | CC BY-SA 4.0 |
| Zaragoza | [Bandera de la provincia de Zaragoza.svg](https://commons.wikimedia.org/wiki/File:Bandera_de_la_provincia_de_Zaragoza.svg) | David Ll L | CC BY-SA 4.0 |
