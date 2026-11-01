// @ts-check
// Tutorial interactivo: una partida corta (tu provincia contra sus vecinas, en Fácil) con un globo que
// explica cada paso y avanza solo cuando lo haces. Resalta el botón que toca pulsar.
import {S, save} from '../store.js';
import {sound, announce} from '../fx.js';
import {$, esc} from './dom.js';

const STEPS = [
  {on:'select-own', coach:'', text:'Esta es tu provincia: la del borde dorado. Tócala en el mapa.'},
  {on:'recruit', coach:'rec', text:'Pulsa Reclutar y compra tropas con tu oro. Cada provincia da oro según su población.'},
  {on:'attack', coach:'att', text:'Pulsa Atacar y toca una vecina. Antes de confirmar verás la probabilidad exacta de ganar.'},
  {on:'endturn', coach:'end', text:'Cuando acabes tus órdenes, pulsa Terminar turno. Después juegan los demás.'},
  {on:'economy', coach:'gold', text:'Toca tu oro, arriba: ahí están tus ingresos y las mejoras (logística, artillería…).'},
  {on:'diplomacy', coach:'dip', text:'La bandera de arriba abre la diplomacia: paz, pactos, alianzas y tributos.'},
  {on:'', coach:'', text:'Ya sabes lo básico. En Fácil nadie te ataca si no atacas tú. Conquista todas las provincias para ganar.'},
];

export class Tutor {
  constructor() {
    this.i = 0;
    this.el = document.createElement('div');
    this.el.className = 'coach glass'; this.el.setAttribute('role', 'status');
    $('#war').appendChild(this.el);
    this.draw();
  }
  draw() {
    const s = STEPS[this.i], last = this.i === STEPS.length - 1;
    this.el.innerHTML = `<div class="ct"><span class="num">${this.i + 1}/${STEPS.length}</span><p>${esc(s.text)}</p></div>
      <button class="btn sm${last ? '' : ' ghost'}" id="coachX">${last ? 'Entendido' : 'Saltar'}</button>`;
    this.el.classList.remove('in'); void this.el.offsetWidth; this.el.classList.add('in');
    $('#war').dataset.coach = s.coach;
    /** @type {HTMLElement} */ (this.el.querySelector('#coachX')).onclick = () => { sound('tap'); this.done(); };
    announce(s.text);
  }
  /** Aviso de la partida (orden hecha, hoja abierta…). @param {string} kind */
  on(kind) {
    if (!this.el.isConnected || STEPS[this.i].on !== kind) return;
    this.i++; sound('lock');
    this.draw();
  }
  done() {
    S.tutorial = true; save();
    this.el.remove(); delete $('#war').dataset.coach;
  }
}
