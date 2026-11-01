# España en Guerra · Diseño del juego (v2, conquista por turnos)

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
| Población (aprox. INE 2024) | Nivel 1–6: oro por turno y crecimiento |
| Terreno | Montaña +30 % defensa, sierra +15 % |
| Costa | Permite puerto |
| Edificio (uno) | Fortaleza +50 % defensa · Cuartel +2 tropas/turno · Puerto +2 oro · Mercado +50 % oro |
| Lealtad 0–100 | Conquistada empieza en 25; sube 5–15 por turno; por debajo de 30 rinde la mitad; por debajo de 20 y con menos de 3 tropas puede rebelarse |
| Suministro | Unida a tu capital por tu territorio (o aliado con Logística 2): si no, mitad de oro, no crece y −30 % ataque |

**Oro por provincia** = nivel de población (+2 capital, +2 puerto, ×1,5 mercado), a la mitad sin suministro o con lealtad baja.
**Crecimiento** = 1 (+1 si nivel ≥ 4, +2 cuartel, +1 capital) hasta un tope de 12 + 4 × nivel (+10 cuartel, +10 capital).
**Reclutar** = 4 de oro por tropa (3 con cuartel), hasta 10 por provincia y turno.

## Combate

- Fuerza atacante = tropas × (100 + moral − 100 + Artillería 10/nivel + general + rasgo − 30 sin suministro − 25 invierno en montaña) %.
- Fuerza defensora = tropas × (100 + moral − 100 + terreno + fortaleza 50 + capital 20 + general + rasgo) %.
- Cada lado tira 3d6; gana quien saque más con «suma × fuerza». Empate: se repite.
- La probabilidad exacta se ve antes de atacar (convolución de 3d6 con ambas fuerzas).
- Pérdidas: el ganador pierde hasta el 70 % de las tropas del perdedor según lo reñido que fue; si pierde el atacante,
  pierde entre la mitad y todas las que mandó; si gana, conquista y entra con las que le quedan.
- Moral del bando: +3 al ganar, −3 al perder (entre 50 y 200).
- Capital tomada: botín del 30 % del oro y −10 de moral al que la pierde, que traslada su capital.
- Provincia sin defensores: se toma sin combate.

## Diplomacia

Estados entre dos bandos: paz, guerra, pacto de no agresión (10 turnos) y alianza. Relación de −100 a 100.

| Acción | Condición para que acepte (determinista, se avisa antes) |
| --- | --- |
| Paz | Va perdiendo la guerra o la relación es > −20 |
| Pacto | Relación ≥ 0 y no estáis en guerra |
| Alianza | Relación ≥ 50 y enemigo común o tú eres fuerte |
| Regalo (20 / 50 oro) | Relación +10 / +25 |
| Exigir tributo | Si eres ≥ 3 veces más grande y vecino, paga el 20 % de su oro; si no, se ofende |
| Anexión pacífica | Tiene ≤ 2 provincias, relación ≥ 60 y tú eres ≥ 4 veces más grande |
| Declarar guerra | Romper un pacto o alianza: −40 de relación con todos (traición) |

Al atacar a alguien en paz se le declara la guerra. Sus aliados entran en la guerra.

## Dificultad

| | Fácil · Paz | Normal · Tensión | Difícil · Guerra total |
| --- | --- | --- | --- |
| Al empezar | Todos en paz | Todos en paz | Todos en guerra con sus vecinos |
| Bots entre sí | No se atacan | Guerras ocasionales, pactos y alianzas | Atacan sin parar; coalición contra el líder |
| Contigo | Solo pelea quien atacas | Te declaran la guerra si te ven débil o si creces mucho | Agresivos |
| Ventaja de los bots | — | — | +25 % de oro |

## Profundidad

- **Mejoras** (4 ramas × 3 niveles; 30/60/100 de oro): Logística (alcance de movimiento y suministro por aliados),
  Artillería (+10 % ataque por nivel), Diplomacia (+relación y más fácil que acepten), Espionaje (+éxito, más barato).
- **Generales** (hasta 3; 60 de oro): asedio +15 % ataque, defensa +20 %, rapidez +1 alcance, carisma +10 lealtad.
  Suben de nivel con victorias. Van con las tropas que salen de su provincia.
- **Espionaje**: espiar (15), sabotear un edificio (35), agitar −30 lealtad (25). Si falla, −20 de relación.
- **Eventos** (uno por turno como mucho): sequía, revuelta, fiestas, plaga, desertores, mercaderes, voluntarios, nevada.
- **Estaciones**: cada 3 turnos. Invierno: −25 % al atacar montañas y menos crecimiento allí.
- **Niebla de guerra** (opcional): solo ves las tropas de tus provincias, sus vecinas, las aliadas y las espiadas.
- **Victoria**: dominación, capitales, diplomática (todos los vivos en pacto o alianza contigo y ≥ 30 % del mapa),
  supervivencia (campaña) o puntos al llegar a un turno.

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
