// @ts-check
// Tablas de reglas del modo conquista (v3): edificios con niveles, especialidades, maravillas, tipos de tropa,
// tácticas y posturas, habilidades de los generales, ministros, eras, decisiones y misiones. Solo datos:
// el motor (engine.js) y el fin de turno (turn.js) los aplican. Números explicados en docs/DISENO.md.

/* ======================= Edificios ======================= */
/**
 * @typedef {'fortaleza'|'muralla'|'cuartel'|'granja'|'mercado'|'puerto'|'mina'|'catedral'|'universidad'|'astillero'|'torre'|'hospital'|'almacen'|'caminos'} Building
 * @typedef {{name:string, cost:number, max:number, era?:number, coast?:boolean, hills?:boolean, desc:string[]}} BuildingInfo
 */
/** @type {Record<Building, BuildingInfo>} */
export const BUILDINGS = {
  granja:{name:'Granja', cost:25, max:3, desc:['+1 tropa por turno', '+2 tropas por turno', '+3 tropas por turno']},
  mercado:{name:'Mercado', cost:40, max:3, desc:['+25 % de oro aquí', '+50 % de oro aquí', '+75 % de oro aquí']},
  cuartel:{name:'Cuartel', cost:35, max:3, desc:['+1 tropa por turno, reclutar −1 de oro, tope +8', '+2 tropas por turno, tope +16', '+3 tropas por turno, tope +24']},
  fortaleza:{name:'Fortaleza', cost:40, max:3, desc:['+25 % de defensa', '+50 % de defensa', '+75 % de defensa']},
  muralla:{name:'Murallas', cost:45, max:3, desc:['+30 % de defensa; solo caen con asedio', '+60 % de defensa', '+90 % de defensa']},
  puerto:{name:'Puerto', cost:30, max:3, coast:true, desc:['+2 de oro y comercio por mar', '+4 de oro', '+6 de oro']},
  mina:{name:'Mina', cost:35, max:3, hills:true, desc:['+2 de oro (montaña o sierra)', '+4 de oro', '+6 de oro']},
  catedral:{name:'Catedral', cost:45, max:3, desc:['+5 de lealtad por turno', '+10 de lealtad, sin revueltas', '+15 de lealtad, sin revueltas']},
  torre:{name:'Torre de vigía', cost:25, max:2, desc:['Ves tropas y postura a 2 provincias; +10 % de defensa', 'Ves a 3 provincias; +20 % de defensa']},
  caminos:{name:'Caminos', cost:30, max:2, desc:['+1 de alcance al mover desde aquí', '+2 de alcance al mover desde aquí']},
  universidad:{name:'Universidad', cost:50, max:3, era:1, desc:['+2 de saber por turno', '+4 de saber por turno', '+6 de saber por turno']},
  astillero:{name:'Astillero', cost:45, max:3, era:1, coast:true, desc:['Construye 2 barcos por turno', '4 barcos por turno', '6 barcos por turno']},
  almacen:{name:'Almacén', cost:30, max:2, era:2, desc:['Suministro aunque quede aislada; tope +6', 'Tope +12']},
  hospital:{name:'Hospital', cost:40, max:3, era:2, desc:['−15 % de bajas en batallas de aquí', '−30 % de bajas', '−45 % de bajas']},
};
export const BUILDING_KEYS = /** @type {Building[]} */ (Object.keys(BUILDINGS));
/** Huecos de edificio según el nivel de población (la capital tiene uno más). @param {number} tier */
export const slotsFor = tier => tier >= 5 ? 4 : tier >= 3 ? 3 : 2;

/* ======================= Especialidades ======================= */
export const SPECIALTIES = {
  cereal:{name:'Cereal', desc:'+1 tropa por turno'},
  vino:{name:'Vino', desc:'+2 de oro'},
  hierro:{name:'Hierro', desc:'Reclutar −1 de oro aquí; artillería −2'},
  pesca:{name:'Pesca', desc:'+2 de oro'},
  huerta:{name:'Huerta', desc:'+1 tropa por turno y +1 de oro'},
  olivo:{name:'Olivo', desc:'+3 de oro'},
  ganado:{name:'Ganado', desc:'+1 de oro; caballería −2 de oro aquí'},
  industria:{name:'Industria', desc:'+3 de oro; edificios −20 % aquí'},
  comercio:{name:'Comercio', desc:'+30 % de oro aquí y +1 por ruta comercial'},
  mineria:{name:'Minería', desc:'+2 de oro; la mina rinde el doble'},
  turismo:{name:'Turismo', desc:'+4 de oro si su dueño no está en guerra'},
  madera:{name:'Madera', desc:'Edificios −20 % aquí; barcos −30 %'},
};

/* ======================= Maravillas ======================= */
/** Una por provincia; da su efecto a quien tenga esa provincia (si cae, la gana el conquistador). */
export const WONDERS = {
  alhambra:{name:'La Alhambra', ine:'18', cost:160, desc:'+10 % de defensa en todas tus provincias'},
  sagrada:{name:'La Sagrada Familia', ine:'08', cost:180, desc:'+15 % de oro'},
  mezquita:{name:'La Mezquita', ine:'14', cost:140, desc:'Asimilas el doble de rápido y +3 de lealtad por turno'},
  acueducto:{name:'El Acueducto', ine:'40', cost:120, desc:'−30 % de mantenimiento del ejército'},
  santiago:{name:'La Catedral de Santiago', ine:'15', cost:140, desc:'+10 % de ataque'},
  escorial:{name:'El Escorial', ine:'28', cost:160, desc:'+1 general y empiezan en nivel 1'},
  giralda:{name:'La Giralda', ine:'41', cost:140, desc:'+2 de oro por cada ruta comercial'},
  murallas:{name:'Las Murallas de Ávila', ine:'05', cost:110, desc:'+30 % de defensa en tu capital'},
  alcazar:{name:'El Alcázar de Toledo', ine:'45', cost:130, desc:'Reclutar −1 de oro en todas tus provincias'},
  pilar:{name:'El Pilar', ine:'50', cost:120, desc:'Lo que conquistas empieza con 60 de lealtad'},
  salamanca:{name:'La Universidad de Salamanca', ine:'37', cost:140, desc:'Saberes −25 % y +3 de saber por turno'},
  merida:{name:'El Teatro de Mérida', ine:'06', cost:120, desc:'No hay revueltas en tus provincias'},
  belem:{name:'La Torre de Belém', ine:'PT', cost:140, desc:'Barcos −40 %'},
};
/** @typedef {keyof typeof WONDERS} Wonder */

/* ======================= Tropas ======================= */
/** Tipos de tropa: índice en el vector de unidades de cada provincia. */
export const INF = 0, CAB = 1, ART = 2, MIL = 3;
export const UNITS = [
  {k:'inf', name:'Infantería', cost:4, def:100, up:1, desc:'La base de todo ejército'},
  {k:'cab', name:'Caballería', cost:8, def:90, up:2, desc:'+35 % atacando en llanura, −15 % en montaña; persigue (menos bajas al ganar)'},
  {k:'art', name:'Artillería', cost:10, def:70, up:2, era:1, desc:'+60 % contra fortalezas y murallas; abre brecha en los asedios'},
  {k:'mil', name:'Milicia', cost:2, def:95, up:0, desc:'Barata y sin mantenimiento; solo defiende'},
];
/** Fuerza de ataque (×100) de cada tipo según el terreno del objetivo y si está fortificado. @param {number} t @param {'m'|'s'|'l'} terr @param {boolean} fort */
export function unitAttack(t, terr, fort) {
  if (t === INF) return 100;
  if (t === CAB) return terr === 'l' ? 135 : terr === 's' ? 105 : 85;
  if (t === ART) return fort ? 160 : 110;
  return 0;
}

/* ======================= Tácticas y posturas ======================= */
/** Tácticas del atacante: su ventaja y la postura que la contrarresta. */
export const TACTICS = [
  {name:'Asalto', desc:'+15 % de ataque. Una emboscada lo castiga.', counter:1},
  {name:'Flanqueo', desc:'+5 %, +25 % con un tercio de caballería. Unas defensas fortificadas lo frenan.', counter:2},
  {name:'Asedio', desc:'+25 % contra fortalezas y murallas, −10 % si no hay. Un contraataque lo castiga.', counter:3},
];
/** Posturas de defensa de cada provincia (la ve quien tenga información). */
export const STANCES = [
  {name:'Resistir', desc:'Sin sorpresas: ni gana ni pierde.'},
  {name:'Emboscada', desc:'Castiga el asalto (−30 % al atacante); −5 % si no es un asalto.'},
  {name:'Fortificar', desc:'Frena el flanqueo (−30 % al atacante); −5 % si no es un flanqueo.'},
  {name:'Contraataque', desc:'Castiga el asedio (−30 % y más bajas); −5 % si no es un asedio.'},
];

/* ======================= Generales ======================= */
/** @typedef {'asedio'|'defensa'|'rapidez'|'carisma'|'tactico'|'veterano'|'intendente'|'jinete'} Skill */
export const SKILLS = {
  asedio:{name:'Asedio', desc:'+15 % de ataque (+5 por nivel)'},
  defensa:{name:'Defensa', desc:'+20 % de defensa (+5 por nivel)'},
  rapidez:{name:'Rapidez', desc:'+1 de alcance al mover'},
  carisma:{name:'Carisma', desc:'+10 de lealtad por turno alrededor'},
  tactico:{name:'Táctico', desc:'Las tácticas rinden el doble y los contraataques la mitad'},
  veterano:{name:'Veterano', desc:'−25 % de bajas propias'},
  intendente:{name:'Intendente', desc:'Su provincia y las vecinas siempre tienen suministro'},
  jinete:{name:'Jinete', desc:'+20 % a la caballería que lleva'},
};
/** Experiencia para cada nivel (0 a 3). */
export const GEN_XP = [0, 3, 6, 10];
export const GEN_RETIRE = 50;

/* ======================= Ministros ======================= */
export const MINISTER_ROLES = {guerra:'Guerra', hacienda:'Hacienda', diplomacia:'Diplomacia'};
/** @typedef {'guerra'|'hacienda'|'diplomacia'} Role */
export const MINISTERS = {
  guerra:{reclutador:'Reclutar −1 de oro', estratega:'+5 % de ataque', ingeniero:'Los asedios abren brecha más deprisa', intendente:'−20 % de mantenimiento'},
  hacienda:{recaudador:'+10 % de oro', mercader:'+1 de oro por ruta comercial', constructor:'Edificios −15 %', austero:'Los impuestos altos restan menos lealtad'},
  diplomacia:{embajador:'Aceptan antes tus propuestas', casamentero:'Bodas más fáciles', espia:'+10 % de éxito en espionaje', negociador:'Comprar provincias −25 %'},
};
export const MINISTER_NAMES = ['Don Gaspar', 'Doña Inés', 'Don Rodrigo', 'Doña Mencía', 'Don Álvaro', 'Doña Beatriz', 'Don Íñigo', 'Doña Leonor', 'Don Fadrique', 'Doña Urraca', 'Don Nuño', 'Doña Elvira', 'Don Pedro', 'Doña Teresa', 'Don Lope', 'Doña Juana'];
export const MINISTER_COST = 40;

/* ======================= Eras ======================= */
export const ERAS = [
  {name:'Medieval', at:0, desc:'Infantería, caballería y milicia.'},
  {name:'Renacimiento', at:5, desc:'Artillería, universidades, astilleros. +10 % de oro.'},
  {name:'Moderna', at:12, desc:'Hospitales y almacenes. +10 % de ataque.'},
];
/** Era de un bando según cuántos saberes conoce. @param {number} n */
export const eraOf = n => n >= ERAS[2].at ? 2 : n >= ERAS[1].at ? 1 : 0;

/* ======================= Saberes ======================= */
/**
 * Árbol de saberes: 24 en tres eras. br: rama clásica que sube un nivel (0 logística, 1 armamento, 2 diplomacia,
 * 3 espionaje; -1 si es un saber especial). Se pagan con puntos de saber (o con oro: 4 por punto que falte).
 * @typedef {{k:string, name:string, era:number, br:number, cost:number, req:string[], desc:string}} Saber
 * @type {Saber[]}
 */
export const SABERES = [
  {k:'calzadas', name:'Calzadas', era:0, br:0, cost:15, req:[], desc:'Mover 2 provincias'},
  {k:'herreria', name:'Herrería', era:0, br:1, cost:15, req:[], desc:'+10 % de ataque'},
  {k:'cancilleria', name:'Cancillería', era:0, br:2, cost:15, req:[], desc:'Aceptan antes tus propuestas'},
  {k:'correos', name:'Correos y espías', era:0, br:3, cost:15, req:[], desc:'+15 % de éxito al espiar'},
  {k:'estribo', name:'Estribo', era:0, br:-1, cost:21, req:['herreria'], desc:'Caballería +15 % al atacar'},
  {k:'rotacion', name:'Rotación de cultivos', era:0, br:-1, cost:18, req:[], desc:'+1 tropa por turno donde haya granja'},
  {k:'gremios', name:'Gremios', era:0, br:-1, cost:18, req:[], desc:'+1 de oro por nivel de mercado'},
  {k:'mamposteria', name:'Mampostería', era:0, br:-1, cost:18, req:['calzadas'], desc:'Edificios −10 %'},
  {k:'intendencia', name:'Intendencia', era:1, br:0, cost:43, req:['calzadas'], desc:'Mover 3 provincias'},
  {k:'polvora', name:'Pólvora', era:1, br:1, cost:46, req:['herreria'], desc:'+20 % de ataque'},
  {k:'embajadas', name:'Embajadas', era:1, br:2, cost:43, req:['cancilleria'], desc:'Los regalos rinden el doble'},
  {k:'cifrado', name:'Cifrado', era:1, br:3, cost:43, req:['correos'], desc:'+30 % de éxito y espiar −30 %'},
  {k:'imprenta', name:'Imprenta', era:1, br:-1, cost:46, req:['cancilleria'], desc:'+3 de saber por turno'},
  {k:'navegacion', name:'Navegación de altura', era:1, br:-1, cost:43, req:['calzadas'], desc:'Barcos con 7 tropas; desembarco −10 % en vez de −20 %'},
  {k:'banca', name:'Banca', era:1, br:-1, cost:50, req:['gremios'], desc:'+10 % de oro'},
  {k:'tercios', name:'Tercios', era:1, br:-1, cost:50, req:['herreria'], desc:'Infantería +10 % al atacar y al defender'},
  {k:'postas', name:'Postas', era:2, br:0, cost:78, req:['intendencia'], desc:'Suministro a través de aliados'},
  {k:'fundicion', name:'Fundición de cañones', era:2, br:1, cost:85, req:['polvora'], desc:'+30 % de ataque'},
  {k:'tratados', name:'Tratados', era:2, br:2, cost:78, req:['embajadas'], desc:'Pactos de 20 turnos'},
  {k:'policia', name:'Policía secreta', era:2, br:3, cost:78, req:['cifrado'], desc:'+45 % de éxito al espiar'},
  {k:'abaluartada', name:'Fortificación abaluartada', era:2, br:-1, cost:85, req:['mamposteria', 'polvora'], desc:'+15 % de defensa con murallas o fortaleza'},
  {k:'ilustracion', name:'Ilustración', era:2, br:-1, cost:93, req:['imprenta'], desc:'+10 % de oro y +2 de lealtad por turno'},
  {k:'medicina', name:'Medicina', era:2, br:-1, cost:81, req:['imprenta'], desc:'−20 % de bajas propias; las epidemias no matan'},
  {k:'academias', name:'Academias militares', era:2, br:-1, cost:85, req:['tercios'], desc:'+1 general y los nuevos empiezan en nivel 1'},
];
/** Oro por cada punto de saber que falta al aprender. */
export const GOLD_PER_SABER = 4;

/* ======================= Impuestos y mantenimiento ======================= */
export const TAXES = [
  {name:'Bajos', gold:60, loyal:4},
  {name:'Normales', gold:100, loyal:0},
  {name:'Altos', gold:150, loyal:-6},
];
/** Tropas por cada moneda de mantenimiento, por encima de la guarnición gratuita (la milicia no cuenta; caballería y artillería cuentan doble). */
export const UPKEEP_PER = 8;
export const SHIP_COST = 20, SHIP_CAP = 5;

/* ======================= Decisiones ======================= */
/** Sucesos que piden una decisión al jugador; la última opción es la que se toma si no contesta. */
export const DECISIONS = {
  revuelta:{title:'Revuelta en {P}', text:'Los vecinos protestan por los impuestos y la guerra.', opts:['Pagar 30 de oro (+30 de lealtad)', 'Mandar tropas (−3 tropas, +15 de lealtad)', 'Ignorarla (−20 de lealtad)']},
  cosecha:{title:'Gran cosecha en {P}', text:'Los graneros rebosan.', opts:['Venderla (+40 de oro)', 'Repartirla (+4 tropas)']},
  mercaderes:{title:'Mercaderes genoveses', text:'Ofrecen sus saberes a buen precio.', opts:['Comprar (−60 de oro, +1 nivel en tu mejora más baja)', 'Cobrarles peaje (+25 de oro)']},
  refugiados:{title:'Refugiados en {P}', text:'Huyen de la guerra y piden asilo.', opts:['Acogerlos (+5 de milicia, −10 de lealtad)', 'Rechazarlos']},
  bandidos:{title:'Bandidos en {P}', text:'Asaltan los caminos y los mercados.', opts:['Perseguirlos (−2 tropas, +10 de lealtad)', 'Pagarles (−20 de oro)', 'Dejarlos (−50 % de oro aquí 3 turnos)']},
  noble:{title:'Un noble pide favores', text:'Quiere tierras y títulos a cambio de su lealtad.', opts:['Concederlos (−30 de oro, +15 de lealtad en tu capital)', 'Negarlos (+5 de poder, −10 de lealtad en tu capital)']},
  plata:{title:'Vetas de plata en {P}', text:'Los mineros han dado con un filón.', opts:['Explotarlo (+1 nivel de mina si cabe; si no, +30 de oro)', 'Vender la concesión (+50 de oro)']},
  epidemia:{title:'Epidemia en {P}', text:'Una fiebre se extiende por los cuarteles.', opts:['Cuarentena (sin oro aquí 2 turnos)', 'Seguir (−30 % de tropas aquí)']},
  artistas:{title:'Artistas buscan mecenas', text:'Pintores y poetas acuden a tu corte.', opts:['Mecenazgo (−40 de oro, +10 de poder)', 'Despedirlos']},
  desertor:{title:'Un oficial enemigo deserta', text:'Trae planes y quiere servirte.', opts:['Acogerle (un general gratis si hay hueco)', 'Devolverlo (+15 de relación con su bando)']},
};
/** @typedef {keyof typeof DECISIONS} DecisionKind */

/* ======================= Misiones ======================= */
export const MISSIONS = {
  conquistar:'Toma {P}',
  construir:'Construye o mejora {n} edificios',
  pacto:'Firma un pacto, una alianza o una boda',
  ejercito:'Reúne {n} tropas',
  ahorro:'Ahorra {n} de oro',
};
