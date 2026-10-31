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

Las 47 provincias · Comunidades autónomas (15) · Reinos medievales (c. 1200) · Península con Portugal ·
Tu comunidad · Tu provincia contra sus vecinas · Campaña · Desafío diario.
