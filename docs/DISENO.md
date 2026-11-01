# España en Guerra · Diseño del juego (v4, conquista por turnos)

Juegas con un bando y conquistas España provincia a provincia. No hay ruleta: tú decides a quién atacas y cuándo.
Todo el motor es determinista (generador con semilla, solo aritmética entera) para poder repetir partidas y
jugar en red por órdenes.

## Turno

1. **Tu fase.** Das órdenes en el orden que quieras:
   - **Atacar** una provincia enemiga limítrofe con las tropas que elijas. Se resuelve en el acto con dados.
   - **Mover** tropas entre tus provincias (alcance 1, más con Logística o un general rápido).
   - **Reclutar** tropas con oro, **construir**, **investigar**, **espiar** y **diplomacia**.
   - Las tropas que atacan o se mueven ya no actúan más este turno.
   - Puedes **deshacer** movimientos, reclutas, edificios y mejoras hasta tu último ataque.
2. **Terminar turno.** Actúan los bots (se ve en el mapa; los ataques contra ti se ven con dados).
3. **Mantenimiento.** Oro, crecimiento de tropas, lealtad, suministro, rebeliones, eventos y estación.

## Provincias

| Dato | Efecto |
| --- | --- |
| Población (aprox. INE 2024) | Nivel 1–6: oro por turno, crecimiento y huecos de edificio (2 hasta nivel 2, 3 hasta nivel 4, 4 desde 5; +1 la capital) |
| Terreno | Montaña +30 % defensa, sierra +15 %; la mina pide montaña o sierra |
| Costa | Permite puerto y astillero; mares conectados para desembarcos y bloqueos |
| Especialidad | Cereal, vino, hierro, pesca, huerta, olivo, ganado, industria, comercio, minería, turismo o madera (ver abajo) |
| Cultura | Castellana, catalana, vasca, gallega, andaluza, valenciana, aragonesa, asturleonesa o portuguesa. Distinta a la tuya: −3 de lealtad por turno hasta asimilarla (24 turnos; 12 con La Mezquita) |
| Impuestos | Bajos 60 % de oro y +4 de lealtad · Normales · Altos 150 % de oro y −6 de lealtad |
| Postura de defensa | Resistir, emboscada, fortificar o contraataque (ver Combate) |
| Lealtad 0–100 | Conquistada empieza en 50; por debajo de 30 rinde la mitad; por debajo de 20 y con pocas tropas puede rebelarse (no con catedral nivel 2) |
| Suministro | Unida a tu capital por tu territorio, aliados federados, un almacén o un general intendente: si no, mitad de oro, no crece y −30 % ataque |

### Edificios (niveles 1–3)

Mejorar un edificio no ocupa hueco nuevo. El precio sube con el nivel.

| Edificio | Oro | Nivel 1 → 3 |
| --- | --- | --- |
| Granja | 25 | +1 → +3 tropas por turno |
| Mercado | 40 | +25 % → +75 % de oro aquí |
| Cuartel | 35 | +1 → +3 tropas por turno, tope +8 → +24, reclutar −1 de oro |
| Fortaleza | 40 | +25 % → +75 % de defensa |
| Murallas | 45 | +30 % → +90 % de defensa; solo caen con asedio |
| Puerto (costa) | 30 | +2 → +6 de oro y rutas comerciales por mar |
| Mina (montes) | 35 | +2 → +6 de oro |
| Catedral | 45 | +5 → +15 de lealtad; desde nivel 2, sin revueltas |
| Torre de vigía (2 niveles) | 25 | Ves tropas y postura a 2 → 3 provincias; +10 → +20 % de defensa |
| Caminos (2 niveles) | 30 | +1 → +2 de alcance al mover desde aquí |
| Universidad (Renacimiento) | 50 | +2 → +6 de saber por turno |
| Astillero (Renacimiento, costa) | 45 | 2 → 6 barcos por turno |
| Almacén (Moderna, 2 niveles) | 30 | Suministro aunque esté aislada; tope +6 → +12 |
| Hospital (Moderna) | 40 | −15 % → −45 % de bajas en batallas de aquí |

### Especialidades

Cereal +1 tropa · Vino +2 oro · Hierro reclutar −1 (artillería −2) · Pesca +2 oro · Huerta +1 tropa y +1 oro ·
Olivo +3 oro · Ganado +1 oro y caballería −2 · Industria +3 oro y edificios −20 % · Comercio +30 % de oro y +1 por ruta ·
Minería +2 oro y mina doble · Turismo +4 oro si su dueño está en paz · Madera edificios −20 % y barcos −30 %.

### Maravillas

Una por partida y sitio, en su provincia histórica. Se dibujan en el mapa y suman 30 puntos.

| Maravilla | Oro | Efecto |
| --- | --- | --- |
| La Alhambra (Granada) | 160 | +10 % de defensa en todas tus provincias |
| La Sagrada Familia (Barcelona) | 180 | +15 % de oro |
| La Mezquita (Córdoba) | 140 | Asimilas el doble de rápido y +3 de lealtad |
| El Acueducto (Segovia) | 120 | −30 % de mantenimiento |
| La Catedral de Santiago (A Coruña) | 140 | +10 % de ataque |
| El Escorial (Madrid) | 160 | +1 general y empiezan en nivel 1 |
| La Giralda (Sevilla) | 140 | +2 de oro por ruta comercial |
| Las Murallas de Ávila | 110 | +30 % de defensa en tu capital |
| El Alcázar de Toledo | 130 | Reclutar −1 de oro |
| El Pilar (Zaragoza) | 120 | Lo conquistado empieza con 60 de lealtad |
| La Universidad de Salamanca | 140 | Saberes −25 % y +3 de saber por turno |
| El Teatro de Mérida (Badajoz) | 120 | Sin revueltas |
| La Torre de Belém (Portugal) | 140 | Barcos −40 % |

### Economía

**Oro por turno** = provincias (nivel + capital + edificios + especialidad, × mercado × impuestos × era, ministros,
maravillas y cansancio) + rutas comerciales + tributos − tributos pagados − mantenimiento.

- **Rutas comerciales**: con cada bando en paz, pacto, alianza o vasallaje con el que tengas frontera, o puerto
  ambos. 2 de oro por ruta (+1 con mercado, +2 La Giralda, +1 ministro mercader). El embargo las corta.
- **Mantenimiento**: cada provincia mantiene gratis 6 + 2 × nivel de tropas; el resto paga 1 de oro por cada 8
  (caballería y artillería cuentan doble; la milicia no paga). Cada barco cuesta 1 por turno.
- **Bancarrota**: con el oro en negativo desertan tropas de las provincias más grandes.

## Ejército

| Tropa | Oro | Ataque | Defensa | Mantenimiento |
| --- | --- | --- | --- | --- |
| Infantería | 4 | 100 % | 100 % | 1 |
| Caballería | 8 | 135 % en llanura, 105 % sierra, 85 % montaña; persigue (menos bajas al ganar) | 90 % | 2 |
| Artillería (Renacimiento) | 10 | 160 % contra fortaleza o murallas, si no 110 %; abre brecha | 70 % | 2 |
| Milicia | 2 | No ataca | 95 % | 0 |

- Se recluta hasta 12 por orden y hasta el doble del tope de la provincia.
- **Generales** (hasta 3; 60 de oro) con árbol de habilidades: asedio, defensa, rapidez, carisma, táctico, veterano,
  intendente y jinete. Ganan experiencia en batalla (niveles a 3, 6 y 10 victorias) y eligen otra habilidad al subir.
  Envejecen: se retiran hacia los 50 turnos de servicio y pueden morir en una derrota o asesinados.
- **Flota**: barcos con astillero (20 de oro). Cada barco lleva 5 tropas en un **desembarco** a cualquier provincia
  costera del mismo mar o el vecino (−20 % de ataque). Con 3 barcos y más que el enemigo, **bloqueo**: sus puertos
  no dan oro ni rutas durante 3 turnos.

## Combate

- Ataque = Σ tropas × ataque de su tipo × (100 + moral − 100 + Armamento 10/nivel + general + táctica + era + ministro
  + maravilla − cansancio/5 − 30 sin suministro − 25 invierno en montaña − 10 cruzar un río) %.
- Defensa = tropas × defensa de su tipo × (100 + moral − 100 + terreno + fortaleza + murallas no abiertas + torre
  + capital 20 + general + rasgo + postura) %.
- Cada lado tira 3d6; gana quien saque más con «suma × fuerza». Empate: se repite. La probabilidad exacta se ve antes
  de atacar y cambia en vivo al elegir tropas y táctica.

### Tácticas y posturas

Antes de atacar eliges táctica; el defensor tiene una postura fija por provincia que solo ves si la espías o tienes una
torre de vigía cerca. Si la postura contrarresta tu táctica, −30 % al ataque (−15 % con un general táctico).

| Táctica | Bonus | La castiga |
| --- | --- | --- |
| Asalto | +15 % | Emboscada |
| Flanqueo | +5 %, +25 % con un tercio de caballería | Fortificar |
| Asedio | +25 % contra fortaleza o murallas, −10 % si no hay | Contraataque (y más bajas) |

Una postura que no acierta da +5 % al atacante.

### Asedios

Las murallas solo se abren con un asedio: desde una provincia vecina con 5 tropas, en guerra. Cada turno la brecha
avanza 1 (+1 con 3 artillerías, +1 ministro ingeniero), la guarnición pierde el 10 % y la lealtad baja 10. Cada punto
de brecha anula un nivel de murallas.

### Cansancio de guerra

+2 por turno por cada guerra (hasta +6) y +3 por derrota; −4 por turno en paz. Resta oro (hasta la mitad), lealtad y
fuerza (1 % por cada 5). Con 60 o más los bots buscan la paz.

## Diplomacia

Estados entre dos bandos: paz, guerra, pacto de no agresión (10 turnos), alianza y federación. Relación de −100 a 100.
Las propuestas muestran antes si aceptará y por qué.

| Acción | Efecto |
| --- | --- |
| Paz · Pacto · Alianza | Como en v2 |
| Federación | Aliados de larga duración: suministro compartido y rutas comerciales |
| Boda entre casas | Relación ≥ 20: +20 de relación durante 20 turnos; romperla es traición |
| Regalo (20 / 50) | +10 / +25 de relación |
| Exigir tributo | Si eres 3 veces más fuerte y vecino: paga cada turno |
| Exigir vasallaje | 3 veces más fuerte, vecino y no odiado: te paga tributo, te sigue a la guerra y cuenta para la victoria |
| Independencia | El vasallo rompe el vasallaje si se ve fuerte |
| Ultimátum | Exiges una provincia; si no te teme y te odia, te declara la guerra |
| Comprar provincia | 25 × nivel + 4 × tropas + 15 × niveles de edificio de oro, si te aprecia |
| Anexión pacífica | ≤ 2 provincias, relación ≥ 60 y 4 veces más fuerte (o tu vasallo) |
| Embargo | Sin rutas comerciales entre vosotros; −15 de relación |
| Declarar guerra | Romper pacto, alianza, federación, boda o vasallaje: −40 de relación con todos (traición) |

Al atacar a alguien en paz se le declara la guerra. Sus aliados y vasallos entran en ella.

### Espionaje

Espiar (15: tropas y postura 3 turnos) · sabotear un edificio (35) · agitar −30 lealtad (25) · asesinar a un general (45) ·
robar una mejora que él tenga y tú no (50) · sobornar una provincia con lealtad < 40 (su precio). Si falla, empeora la
relación (mucho si es asesinato o soborno).

### Consejo de ministros

Guerra, hacienda y diplomacia. Cada ministro tiene un rasgo (p. ej. reclutador, recaudador, embajador) y da consejo
según la situación: fronteras, oro guardado, huecos libres, vecinos dispuestos a pactar. Cambiar uno cuesta 40.

## Dificultad

| | Fácil · Paz | Normal · Tensión | Difícil · Guerra total |
| --- | --- | --- | --- |
| Al empezar | Todos en paz | Todos en paz | Todos en guerra con sus vecinos |
| Bots entre sí | No se atacan | Guerras ocasionales, pactos y alianzas | Atacan sin parar; coalición contra el líder |
| Contigo | Solo pelea quien atacas | Te declaran la guerra si te ven débil o si creces mucho | Agresivos |
| Ventaja de los bots | — | — | +25 % de oro |

## Profundidad

- **Saberes**: árbol de 24 en tres eras, con requisitos. Cada turno se gana saber (2 + 1 por cada 4 provincias,
  +2 por nivel de universidad, +3 la imprenta, +3 Salamanca); lo que falte se paga a 4 de oro por punto.
  Los de las cuatro ramas clásicas suben su nivel (logística, armamento, diplomacia, espionaje):

  | Era | Rama | Especiales |
  | --- | --- | --- |
  | Medieval (15–21) | Calzadas, Herrería, Cancillería, Correos y espías | Estribo (caballería +15 %), Rotación de cultivos (+1 tropa con granja), Gremios (+1 oro por nivel de mercado), Mampostería (edificios −10 %) |
  | Renacimiento, con 5 saberes (43–50) | Intendencia, Pólvora, Embajadas, Cifrado | Imprenta (+3 saber), Navegación de altura (barcos de 7, desembarco −10 %), Banca (+10 % oro), Tercios (infantería +10 % al atacar y defender) |
  | Moderna, con 12 saberes (78–93) | Postas, Fundición de cañones, Tratados, Policía secreta | Fortificación abaluartada (+15 % defensa con murallas o fortaleza), Ilustración (+10 % oro, +2 lealtad), Medicina (−20 % bajas, epidemias sin muertes), Academias militares (+1 general, nivel 1) |

- **Eras**: Medieval; Renacimiento con 5 saberes (artillería, universidades, astilleros, +10 % de oro);
  Moderna con 12 (hospitales, almacenes, +10 % de ataque).
- **Decisiones**: a veces llega una decisión con dos o tres opciones (revuelta, cosecha, mercaderes, refugiados,
  bandidos, un noble, plata, epidemia, artistas, un desertor). Si no eliges, se toma la última al terminar el turno.
- **Misiones**: encargos con plazo y premio (tomar una provincia, construir, firmar un acuerdo, reunir tropas, ahorrar).
- **Eventos** (uno por turno como mucho): sequía, revuelta, fiestas, plaga, desertores, mercaderes, voluntarios, nevada.
- **Catástrofes regionales**: riada del Ebro, sequía en La Mancha, incendio en la sierra o terremoto en el sureste.
  Se ven sobre las provincias del mapa mientras duran; las dos últimas destruyen tropas y edificios.
- **Estaciones**: cada 3 turnos. Invierno: −25 % al atacar montañas y menos crecimiento allí.
- **Niebla de guerra** (opcional): solo ves las tropas de tus provincias, sus vecinas, las aliadas, las espiadas y las
  que alcanzan tus torres.
- **Victoria**: dominación (o 60 % del mapa con todos los demás vasallos tuyos), capitales, diplomática (todos los
  vivos en pacto, alianza, federación o vasallaje contigo y ≥ 30 % del mapa), supervivencia (campaña) o puntos.

## Mapa

- **Ciudades** dibujadas en cada provincia al acercar: crecen con la población y los edificios, y muestran murallas,
  catedral, torre, puerto, maravilla y, alrededor, los demás edificios ilustrados (granja, mina, cuartel…).
- **Fichas por nivel de zoom**: de lejos, solo el número (y una corona en las capitales); al acercar, insignia del tipo
  de tropa dominante, castillo y bandera en las capitales e insignia del edificio principal (dorada si hay maravilla).
- **Fronteras** en vectorial siempre: finas y nítidas a cualquier zoom; dentro de un mismo bando, discontinuas y suaves.
- **Informe de provincia** (tocando los datos de la ficha): desglose de oro, tropas por turno, lealtad y defensa.
- **Batallas**: flecha, marcha de la ficha, choque de espadas con onda y chispas en la frontera, dados y bajas que suben
  sobre las dos provincias.

## Escenarios

| Escenario | Bandos | Notas |
|---|---|---|
| Las 47 | 47 | Cada provincia es un bando. |
| Comunidades | 15 | Capital en la capital autonómica. |
| Reinos | 7 | Hacia 1200, con colores propios. |
| Península | 16 | Las comunidades y Portugal. Portugal es la provincia 47 (solo existe en este escenario): costa de Natural Earth y frontera del IGN, así encaja sin huecos. Nivel de población 6, sierra y costa. |
| Tu región | 2–9 | Tu comunidad y las que tocan con ella. El resto del mapa queda fuera de juego (gris, sin nombre ni fichas). |
| Tu provincia | 3–9 | Tu provincia y sus vecinas, una por bando. |

Reglas a medida: tropas al empezar 3 · 6 · 10 (+4 en las capitales), oro ×0,75 · ×1 · ×1,5, rasgo del líder
elegido o al azar. **Bando propio**: sustituye el nombre y la bandera del bando elegido; el color del mapa es
el primer color de la bandera que no sea casi blanco ni casi negro.

## Campaña y desafío diario

Ocho misiones encadenadas (cada una se abre al ganar la anterior). Semilla fija por misión. Estrellas: 3 si
ganas en ≤ T₃ turnos, 2 si en ≤ T₂, 1 si ganas.

| # | Misión | Escenario · bando | Dificultad · victoria | T₃ / T₂ |
|---|---|---|---|---|
| 1 | El primer paso | Tu provincia · Soria | Fácil · dominación | 14 / 22 |
| 2 | Tierra de frontera | Tu provincia · Teruel | Normal · dominación | 16 / 26 |
| 3 | La corona de Aragón | Tu región · Aragón | Normal · dominación | 26 / 40 |
| 4 | Los cinco reinos | Reinos · Navarra | Normal · capitales | 30 / 46 |
| 5 | La pluma y la espada | Comunidades · Madrid | Normal · diplomática | 30 / 46 |
| 6 | El último reino | Reinos · Granada | Difícil · dominación | 45 / 70 |
| 7 | Iberia | Península · Portugal | Normal · dominación | 50 / 80 |
| 8 | Las 47 | Las 47 · Soria | Difícil · capitales | 50 / 80 |

**Desafío diario**: la fecha local (AAAA-MM-DD) siembra el escenario, el bando, la dificultad (Normal o
Difícil) y la semilla de la partida, así todo el mundo juega lo mismo ese día. 30 turnos y victoria por
puntos: 10 por provincia, 1 por cada 5 tropas, 25 por capital y 1 por cada 10 de oro. Se guarda la mejor
marca del día y se puede compartir.

## Crónica, final y logros

- La crónica guarda los sucesos destacados (guerras, traiciones, capitales tomadas, eliminaciones, acuerdos,
  revueltas y la victoria), como mucho 160. Al empezar cada año sale un periódico con el titular de más peso
  (victoria 100, eliminación 80, capital 60, anexión 60, traición 50, alianza 35, guerra 30, paz 25,
  tributo 25, pacto 20, revuelta 15; +25 si te afecta), hasta seis breves y el reparto del poder.
- El final muestra la gráfica de provincias por turno (tú y los cuatro bandos que más crecieron) y una
  repetición del mapa a partir del historial de dueños (un toque la salta).
- 20 logros en bronce, plata y oro (primera conquista, capital enemiga, 300 de oro, 5 edificios, ramas de
  mejoras, generales de nivel 2, dos alianzas, sobrevivir 100 turnos, ganar en cada dificultad, en menos de
  40 turnos, sin traiciones, por diplomacia, con una sola provincia, la península y la campaña entera).

## Música

Síntesis con WebAudio, sin ficheros. En paz: re menor, i–VI–III–VII, acordes suaves y un arpegio pulsado.
En guerra: cadencia andaluza (i–VII–VI–V) con bajo y tambores. El ánimo va de 0 a 1 según las guerras
abiertas y cambia a medio camino en cada compás. Se apaga con el sonido o con su interruptor.

## Ríos y tierras libres

Ocho ríos (Ebro, Duero, Tajo, Guadiana, Guadalquivir, Miño, Júcar y Segura) trazados a mano en lon/lat. Un
ataque cruza un río si la línea entre las etiquetas de las dos provincias corta su curso: el que defiende
suma +10 % (`RIVER_DEF`). **Rivales**: en un jugador se puede jugar contra 8, 4 o 2 bandos (elegidos con la
semilla); el resto empieza como «Tierras libres» (el bando de los rebeldes): no atacan, no crecen más de 8
tropas y se conquistan como cualquier provincia. **Sobrevivir**: gana el humano que siga vivo en el turno 60.

## Multijugador

Turnos simultáneos sobre ntfy.sh (protocolo v:2, `js/net/warroom.js`). No viaja la partida: todos los móviles
la crean igual con la semilla y la aplican con el mismo motor.

1. Sala: `hello`, `pick` (bando y bando propio), `leave`; el anfitrión publica `lobby` con la configuración
   (escenario, dificultad de los bots, niebla, eventos, victoria, tiempo por turno) y `start` con la semilla.
2. Turno: cada jugador da sus órdenes en su móvil (las ve al momento) y al terminar publica `orders` con la
   lista y su huella (troceada si pasa de 3,8 KB). Cada orden lleva `q` (su número en el turno): los dados de
   ataques, espionaje y generales salen de semilla + turno + bando + q, así no dependen del orden de los demás.
   Un ataque lleva además `x` (dueño y tropas del objetivo al darla): si al resolver han cambiado, se anula.
3. El anfitrión, con las órdenes de todos los vivos (o al agotarse el tiempo, o con «No esperar más»),
   publica `resolve` con las huellas incluidas, los que se han ido (pasan a bots) y la huella del estado final.
4. `resolveTurn` aplica las órdenes por jugador en un orden que rota cada turno, anula las que ya no valen, juega
   los bots y el mantenimiento. Cada móvil compara su huella con la del anfitrión.

Quien vuelve a la app (o entra tarde a mirar) lee lo guardado en ntfy (unas horas) y rehace la partida desde la
semilla. Mensajes rápidos con `chat`. La clasificación del desafío diario publica `score` en un canal del día y
se queda la mejor marca de cada jugador (`js/net/board.js`).
