// @ts-check
// Datos de las provincias para el modo conquista: población aproximada (INE, 2024, en miles), terreno y costa,
// y agrupaciones para los escenarios (comunidades autónomas y reinos hacia 1200). Claves: código INE.

/** Población aproximada en miles. */
export const POP = {
  '01':340, '02':390, '03':1960, '04':750, '05':160, '06':670, '08':5850, '09':360, '10':390, '11':1250,
  '12':600, '13':490, '14':770, '15':1130, '16':200, '17':800, '18':930, '19':270, '20':730, '21':530,
  '22':230, '23':620, '24':450, '25':450, '26':320, '27':325, '28':7000, '29':1750, '30':1550, '31':670,
  '32':305, '33':1010, '34':160, '36':950, '37':330, '39':590, '40':155, '41':1960, '42':90, '43':850,
  '44':135, '45':720, '46':2700, '47':520, '48':1160, '49':165, '50':980, PT:10400,
};
/** Nivel de población (1 a 6) para oro y crecimiento. @param {string} ine */
export function tier(ine) {
  const p = POP[/** @type {keyof typeof POP} */ (ine)] || 100;
  return p < 200 ? 1 : p < 400 ? 2 : p < 800 ? 3 : p < 1500 ? 4 : p < 3000 ? 5 : 6;
}
/** Terreno: m montaña (+30 % defensa), s sierra (+15 %), l llanura. */
const MOUNTAIN = ['22', '25', '33', '39', '24', '44', '18', '32', '05'];
const HILLS = ['31', '17', '48', '20', '01', '26', '42', '16', '23', '04', '29', '27', '40', '19', '12', '30', '03', '43', '36', 'PT'];
/** @param {string} ine @returns {'m'|'s'|'l'} */
export const terrain = ine => MOUNTAIN.includes(ine) ? 'm' : HILLS.includes(ine) ? 's' : 'l';
export const TERRAIN_NAME = {m:'Montaña', s:'Sierra', l:'Llanura'};
export const TERRAIN_DEF = {m:30, s:15, l:0};
/** Provincias con costa (permiten puerto). */
const COAST = ['15', '27', '33', '39', '48', '20', '36', '17', '08', '43', '12', '46', '03', '30', '04', '18', '29', '11', '21', 'PT'];
/** @param {string} ine */
export const coastal = ine => COAST.includes(ine);

/** Comunidades autónomas peninsulares: nombre, provincias (INE) y capital (INE de la provincia). */
export const COMMUNITIES = [
  {name:'Andalucía', ine:['04', '11', '14', '18', '21', '23', '29', '41'], cap:'41'},
  {name:'Aragón', ine:['22', '44', '50'], cap:'50'},
  {name:'Asturias', ine:['33'], cap:'33'},
  {name:'Cantabria', ine:['39'], cap:'39'},
  {name:'Castilla-La Mancha', ine:['02', '13', '16', '19', '45'], cap:'45'},
  {name:'Castilla y León', ine:['05', '09', '24', '34', '37', '40', '42', '47', '49'], cap:'47'},
  {name:'Cataluña', ine:['08', '17', '25', '43'], cap:'08'},
  {name:'Comunitat Valenciana', ine:['03', '12', '46'], cap:'46'},
  {name:'Extremadura', ine:['06', '10'], cap:'06'},
  {name:'Galicia', ine:['15', '27', '32', '36'], cap:'15'},
  {name:'Madrid', ine:['28'], cap:'28'},
  {name:'Murcia', ine:['30'], cap:'30'},
  {name:'Navarra', ine:['31'], cap:'31'},
  {name:'País Vasco', ine:['01', '20', '48'], cap:'01'},
  {name:'La Rioja', ine:['26'], cap:'26'},
];

/** Reinos hacia el año 1200 (simplificado para que la partida esté equilibrada). */
export const KINGDOMS = [
  {name:'Reino de León', ine:['15', '27', '32', '36', '33', '24', '49', '37'], cap:'24', color:'#B23A48'},
  {name:'Reino de Castilla', ine:['39', '09', '34', '47', '40', '05', '42', '28', '19', '45', '16', '26', '01', '48', '20'], cap:'09', color:'#7A3FA0'},
  {name:'Reino de Navarra', ine:['31'], cap:'31', color:'#C8371E'},
  {name:'Corona de Aragón', ine:['22', '50', '44', '25', '17', '08', '43'], cap:'50', color:'#E2A21B'},
  {name:'Almohades de Sevilla', ine:['41', '21', '11', '14', '06', '10', '13'], cap:'41', color:'#2E8B57'},
  {name:'Sharq al-Ándalus', ine:['46', '12', '03', '30', '02'], cap:'46', color:'#1F7A8C'},
  {name:'Taifa de Granada', ine:['18', '29', '04', '23'], cap:'18', color:'#3C6E47'},
];

/** Nombres para los generales (determinista con el generador de la partida). */
export const GIVEN = ['Gonzalo', 'Rodrigo', 'Álvaro', 'Beatriz', 'Elvira', 'Íñigo', 'Martín', 'Leonor', 'Sancho', 'Urraca', 'Tello', 'Berenguela',
  'Pedro', 'Juana', 'Nuño', 'Jimena', 'Fernán', 'Mencía', 'García', 'Teresa', 'Lope', 'Sancha', 'Diego', 'Aldonza'];
export const EPITHET = ['el Bravo', 'la Leona', 'de Lara', 'de Haro', 'el Prudente', 'la Firme', 'de Castro', 'el Mozo', 'de Mendoza', 'la Audaz',
  'el Viejo', 'de Guzmán', 'el Tuerto', 'la Sabia', 'de Zúñiga', 'el Callado', 'de Velasco', 'la Fiera'];

/** Especialidad económica de cada provincia (simplificada a partir de su actividad real). */
export const SPECIALTY = {
  '01':'vino', '02':'ganado', '03':'turismo', '04':'huerta', '05':'ganado', '06':'ganado', '08':'industria', '09':'cereal', '10':'ganado',
  '11':'pesca', '12':'huerta', '13':'vino', '14':'olivo', '15':'pesca', '16':'madera', '17':'turismo', '18':'turismo', '19':'cereal',
  '20':'industria', '21':'mineria', '22':'madera', '23':'olivo', '24':'mineria', '25':'huerta', '26':'vino', '27':'ganado', '28':'comercio',
  '29':'turismo', '30':'huerta', '31':'cereal', '32':'vino', '33':'mineria', '34':'cereal', '36':'pesca', '37':'ganado', '39':'ganado',
  '40':'cereal', '41':'comercio', '42':'madera', '43':'vino', '44':'ganado', '45':'hierro', '46':'comercio', '47':'cereal', '48':'hierro',
  '49':'cereal', '50':'industria', PT:'comercio',
};
/** Cultura de cada provincia: la de un bando distinto tarda en asimilarse. */
export const CULTURE = {
  '15':'gallega', '27':'gallega', '32':'gallega', '36':'gallega', '33':'asturiana', '24':'leonesa', '49':'leonesa', '37':'leonesa',
  '39':'cántabra', '01':'vasca', '20':'vasca', '48':'vasca', '31':'navarra', '22':'aragonesa', '44':'aragonesa', '50':'aragonesa',
  '08':'catalana', '17':'catalana', '25':'catalana', '43':'catalana', '03':'valenciana', '12':'valenciana', '46':'valenciana', '30':'murciana',
  '04':'andaluza', '11':'andaluza', '14':'andaluza', '18':'andaluza', '21':'andaluza', '23':'andaluza', '29':'andaluza', '41':'andaluza',
  '06':'extremeña', '10':'extremeña', PT:'portuguesa',
};
/** @param {string} ine */
export const culture = ine => /** @type {Record<string, string>} */ (CULTURE)[ine] || 'castellana';
/** Mares de las provincias con costa (para la flota). Los desembarcos llegan al mismo mar o al vecino. */
export const SEA = {
  '33':['cant'], '39':['cant'], '48':['cant'], '20':['cant'], '27':['cant', 'atln'], '15':['atln'], '36':['atln'], PT:['atln', 'atls'],
  '21':['atls'], '11':['atls', 'alb'], '29':['alb'], '18':['alb'], '04':['alb', 'lev'], '30':['lev'], '03':['lev'], '46':['lev'], '12':['lev', 'cat'],
  '43':['cat'], '08':['cat'], '17':['cat'],
};
export const SEA_NAME = {cant:'Cantábrico', atln:'Atlántico norte', atls:'Golfo de Cádiz', alb:'Alborán', lev:'Levante', cat:'Mar catalán'};
export const SEA_ADJ = {cant:['atln'], atln:['cant', 'atls'], atls:['atln', 'alb'], alb:['atls', 'lev'], lev:['alb', 'cat'], cat:['lev']};
