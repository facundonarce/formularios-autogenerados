import test from 'node:test';
import assert from 'node:assert/strict';
import { PREGUNTAS, TOMAS, CONFIG_DEFAULT, TIENDAS } from '../shared/catalog.js';
import { calcularPuntaje, puntajesMaximos, esNegativa, elegirTomas, programarSemana, proximaFranja, partesLocales, localAUtc, mulberry32 } from '../shared/logic.js';

const porNum = Object.fromEntries(PREGUNTAS.map((p) => [p.num, p]));

test('ejemplo del usuario: una incidencia Baja en Depósito sobre 3,4', () => {
  // Pregunta 116 no está en el catálogo con puntaje; usamos 124 (Depósito, Bajo).
  const p = porNum[124];
  assert.equal(p.modulo, 'Depósito'); assert.equal(p.impacto, 'Bajo');
  assert.ok(esNegativa(p, 'No'));
  assert.ok(!esNegativa(p, 'Si'));
});

test('Regular y Mala descuentan; Buena no; No se puede relevar no cuenta', () => {
  const p = porNum[47];
  assert.ok(esNegativa(p, 'Regular')); assert.ok(esNegativa(p, 'Mala')); assert.ok(!esNegativa(p, 'Buena'));
  const r = calcularPuntaje([{ pregunta: 47, respuesta: 'No se puede relevar' }], porNum, 'oficial');
  assert.equal(r.total, null);
});

test('puntaje por módulo = 1 - descuentos / pesos evaluados, total = promedio', () => {
  const resp = [
    { pregunta: 121, respuesta: 'Regular' }, // Limpieza Medio 0,3 -> descuenta
    { pregunta: 104, respuesta: 'Buena' },   // Limpieza Alto 0,6
    { pregunta: 124, respuesta: 'No' },      // Depósito Bajo 0,1 -> descuenta
    { pregunta: 127, respuesta: 'Si' },      // Depósito Medio 0,3
  ];
  const r = calcularPuntaje(resp, porNum, 'oficial');
  assert.ok(Math.abs(r.modulos['Limpieza'].pct - (1 - 0.3 / 0.9)) < 1e-9);
  assert.ok(Math.abs(r.modulos['Depósito'].pct - (1 - 0.1 / 0.4)) < 1e-9);
  assert.ok(Math.abs(r.total - ((1 - 0.3 / 0.9) + 0.75) / 2) < 1e-9);
});

test('pendientes de revisión no cuentan; la revisada usa respuesta_final', () => {
  const r = calcularPuntaje([
    { pregunta: 124, respuesta: 'No', revision: 'pendiente' },
    { pregunta: 127, respuesta: 'No', revision: 'revisada', respuesta_final: 'Si' },
  ], porNum, 'oficial');
  assert.equal(r.modulos['Depósito'].pct, 1);
  assert.equal(r.modulos['Depósito'].evaluadas, 1);
});

test('puntajes máximos por tipo de tienda', () => {
  const o = puntajesMaximos(PREGUNTAS, 'oficial');
  const r = puntajesMaximos(PREGUNTAS, 'reseller');
  console.log('máximos oficial', o, 'reseller', r);
  assert.ok(o['Depósito'] > 0 && r['Interior Tienda'] > 0);
});

test('elegirTomas: 4 distintas, sin las excluidas', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 200; i++) {
    const t = elegirTomas({ tomas: TOMAS, n: 4, excluir: ['T3', 'T6'], rng, forzarT3: false });
    assert.equal(new Set(t).size, 4);
    assert.ok(!t.includes('T3') && !t.includes('T6'));
    assert.ok(t.every((x) => x.startsWith('T')));
  }
});

test('zona horaria: 10:00 en Lima es 15:00 UTC', () => {
  const d = localAUtc(2026, 11, 18, 10, 0, 'America/Lima');
  assert.equal(d.toISOString(), '2026-11-18T15:00:00.000Z');
  const b = localAUtc(2026, 11, 18, 10, 0, 'America/Argentina/Buenos_Aires');
  assert.equal(b.toISOString(), '2026-11-18T13:00:00.000Z');
});

test('programarSemana: siempre dentro de una franja y dejando 25 min', () => {
  const rng = mulberry32(3);
  for (const tienda of TIENDAS) {
    for (let k = 0; k < 20; k++) {
      const ahora = new Date('2026-11-16T12:00:00Z'); // lunes en todas las zonas
      const d = programarSemana({ tienda, config: CONFIG_DEFAULT, ahora, rng });
      assert.ok(d, tienda.id);
      const p = partesLocales(d, tienda.timezone);
      const min = p.hh * 60 + p.mm;
      const ok = (min >= 600 && min <= 660 - 25) || (min >= 840 && min <= 900 - 25);
      assert.ok(ok, `${tienda.id} ${p.hh}:${p.mm}`);
      assert.ok(p.weekday >= 1 && p.weekday <= 6);
    }
  }
});

test('programarSemana: no repite día de la semana pasada ni a menos de 2 días', () => {
  const tienda = TIENDAS[0];
  const rng = mulberry32(11);
  const anterior = '2026-11-12T17:00:00Z'; // jueves en México
  for (let k = 0; k < 50; k++) {
    const d = programarSemana({ tienda, config: CONFIG_DEFAULT, ahora: new Date('2026-11-16T06:00:00Z'), anterior, rng });
    const p = partesLocales(d, tienda.timezone);
    assert.notEqual(p.weekday, 4);
  }
});

test('proximaFranja: dentro de la franja actual manda ya; después, la siguiente', () => {
  const tienda = TIENDAS.find((t) => t.pais === 'Argentina');
  const dentro = new Date('2026-11-18T13:10:00Z'); // 10:10 AR
  assert.ok(proximaFranja({ tienda, config: CONFIG_DEFAULT, ahora: dentro }) - dentro <= 61000);
  const tarde = new Date('2026-11-18T13:50:00Z'); // 10:50 AR -> franja 14 hs
  const p = partesLocales(proximaFranja({ tienda, config: CONFIG_DEFAULT, ahora: tarde }), tienda.timezone);
  assert.equal(p.hh, 14);
});
