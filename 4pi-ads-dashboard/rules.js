/**
 * Motor de reglas del método 4Pi (Charley Tichenor / Professor Charley T).
 *
 * Todo lo que compara este archivo es SIEMPRE contra el promedio de la propia
 * cuenta en el período cargado — el método no usa umbrales fijos universales
 * (ver spec, sección 0 y 8). Por eso todas las funciones reciben `averages`
 * calculado a partir del propio dataset, nunca un número hardcodeado.
 *
 * Expone un único objeto global: window.FourPi
 */
(function (global) {
  'use strict';

  const ROLES = {
    TOFU: 'TOFU', // Prospección — arriba del funnel
    MOFU: 'MOFU', // Medio del funnel
    BOFU: 'BOFU', // Cierre — fondo del funnel
  };

  const ROLE_LABELS = {
    TOFU: 'Prospección',
    MOFU: 'Medio',
    BOFU: 'Cierre',
    '': 'Sin definir',
  };

  const METRICS = ['spend', 'frequency', 'cpm', 'cpr'];

  /**
   * Promedio simple. Ignora anuncios sin el dato cargado para esa métrica.
   */
  function average(values) {
    const nums = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
    if (nums.length === 0) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  /**
   * Calcula el promedio de cuenta para las 4 métricas del 4Pi, a partir de
   * la lista de anuncios del período cargado.
   */
  function computeAverages(ads) {
    return {
      spend: average(ads.map((a) => a.spend)),
      frequency: average(ads.map((a) => a.frequency)),
      cpm: average(ads.map((a) => a.cpm)),
      cpr: average(ads.map((a) => a.cpr)),
      totalSpend: ads.reduce((sum, a) => sum + (typeof a.spend === 'number' ? a.spend : 0), 0),
      count: ads.length,
    };
  }

  /**
   * Para una métrica de un anuncio contra el promedio de cuenta, devuelve
   * 'above' | 'below' | 'avg' (empatado) | null (sin dato para comparar).
   * Empate = diferencia menor al 2% del promedio, para no marcar como
   * "arriba"/"abajo" ruido de redondeo.
   */
  function direction(value, avg) {
    if (typeof value !== 'number' || Number.isNaN(value) || avg === null || avg === 0) {
      return null;
    }
    const tolerance = Math.abs(avg) * 0.02;
    if (Math.abs(value - avg) <= tolerance) return 'avg';
    return value > avg ? 'above' : 'below';
  }

  /**
   * Clasifica las 4 métricas de un anuncio contra el promedio de cuenta.
   * Devuelve { spend, frequency, cpm, cpr } cada una 'above' | 'below' | 'avg' | null.
   */
  function classifyAd(ad, averages) {
    return {
      spend: direction(ad.spend, averages.spend),
      frequency: direction(ad.frequency, averages.frequency),
      cpm: direction(ad.cpm, averages.cpm),
      cpr: direction(ad.cpr, averages.cpr),
    };
  }

  /**
   * Patrones de diagnóstico automático (spec secciones 4 y 5).
   * Cada patrón exige una dirección exacta (above/below) en las 4 métricas;
   * un anuncio con algún valor 'avg' (empatado) o sin dato no matchea ningún
   * patrón y cae en "mixed" — es una decisión deliberada: el video no da
   * casos intermedios, así que forzar un match ahí sería inventar precisión
   * que la fuente no tiene.
   */
  const PATTERNS = [
    {
      id: 'prospecting_healthy',
      tone: 'good',
      icon: '✅',
      label: 'Prospección sana',
      match: { spend: 'above', frequency: 'below', cpm: 'below', cpr: 'above' },
      description:
        'Gasta más que el promedio, sigue encontrando audiencia nueva (frecuencia baja) y ' +
        'consigue esa atención barato (CPM bajo). El costo por resultado alto es esperable: ' +
        'está haciendo el trabajo pesado de prospección, no el de cerrar venta.',
    },
    {
      id: 'closing_healthy',
      tone: 'good',
      icon: '✅',
      label: 'Cierre sano',
      match: { spend: 'above', frequency: 'above', cpm: 'above', cpr: 'below' },
      description:
        'Gasta más que el promedio en audiencia ya tibia (frecuencia y CPM altos) pero convierte ' +
        'mejor que el promedio (costo por resultado bajo). Es el patrón esperado en un buen ' +
        'anuncio de cierre / retargeting.',
    },
    {
      id: 'expensive_but_loved',
      tone: 'flag',
      icon: '🚩',
      label: 'Caro, pero todavía querido',
      match: { spend: 'above', frequency: 'above', cpm: 'below', cpr: 'above' },
      description:
        'Sigue recibiendo presupuesto y tiene buen CPM (Meta ve buena experiencia/engagement), ' +
        'pero el costo por resultado es malo. El sistema lo sigue "premiando" aunque el negocio ' +
        'no esté cerrando bien — vale la pena mirar el creativo con el árbol de decisiones.',
    },
    {
      id: 'warm_not_converting',
      tone: 'flag',
      icon: '🚩',
      label: 'Tibio, pero no convierte',
      match: { spend: 'above', frequency: 'above', cpm: 'above', cpr: 'above' },
      description:
        'Audiencia tibia (frecuencia alta), caro en todo sentido (CPM alto) y no convierte bien ' +
        '(costo por resultado alto). Le puede estar robando presupuesto a un anuncio de cierre ' +
        'que sí debería estar recibiendo esa plata.',
    },
    {
      id: 'wrong_attention',
      tone: 'flag',
      icon: '🚩',
      label: 'Atrayendo la atención equivocada',
      match: { spend: 'below', frequency: 'below', cpm: 'below', cpr: 'above' },
      description:
        'Las señales de arriba del funnel se ven bien (CPM bajo, sigue encontrando gente nueva), ' +
        'pero el costo por resultado es malo y Meta no le está aumentando el presupuesto — señal ' +
        'de que engancha a gente sin intención real de compra. Este patrón se lee mejor todavía ' +
        'con CTR/hook rate, que el 4Pi estricto no mide.',
    },
  ];

  /**
   * Diagnostica un anuncio: devuelve el patrón que matchea, o un patrón
   * neutro "mixed" con el detalle de qué metricas están arriba/abajo, para
   * que el usuario lo lea manualmente.
   */
  function diagnoseAd(ad, averages) {
    const classification = classifyAd(ad, averages);
    const found = PATTERNS.find((p) =>
      METRICS.every((m) => classification[m] === p.match[m])
    );
    if (found) {
      return { ...found, classification };
    }
    return {
      id: 'mixed',
      tone: 'neutral',
      icon: '⚪',
      label: 'Sin patrón claro',
      description:
        'La combinación de métricas de este anuncio no matchea ninguno de los 5 patrones del ' +
        'método (el video no cubre todos los casos intermedios). Revisalo manualmente: mirá qué ' +
        'rol de funnel cumple y compará cada métrica contra el promedio de cuenta de abajo.',
      classification,
    };
  }

  /**
   * Lectura de Frecuencia (spec, sección 3): distingue si una frecuencia
   * baja/alta responde a una prospección sana, a resets operativos propios,
   * o a un cierre sano de audiencia tibia. Necesita el log de cambios del
   * anuncio en el período (presupuesto/puja/audiencia) porque Meta no expone
   * ese dato directo.
   *
   * RESET_THRESHOLD: a partir de cuántos cambios logueados en el período se
   * considera que la cuenta se estuvo "reseteando" seguido. Es un número de
   * referencia razonable (no viene del video, que no da cifras exactas) —
   * queda a un click de ajustarse si hace falta.
   */
  const RESET_THRESHOLD = 3;

  function readFrequency(ad, averages) {
    const freqDir = direction(ad.frequency, averages.frequency);
    const spendDir = direction(ad.spend, averages.spend);
    const cprDir = direction(ad.cpr, averages.cpr);
    const changesInPeriod = Array.isArray(ad.changes) ? ad.changes.length : 0;

    if (freqDir === 'below') {
      if (changesInPeriod >= RESET_THRESHOLD) {
        return {
          reason: 'resets',
          text:
            `Frecuencia baja, pero con ${changesInPeriod} cambios de presupuesto/puja/audiencia ` +
            'logueados en el período: probablemente la cuenta se está reseteando seguido y nunca ' +
            'acumula data estable, no que el anuncio esté prospectando sano.',
        };
      }
      if (spendDir === 'below' || spendDir === 'avg') {
        return {
          reason: 'stuck_cold',
          text:
            'Frecuencia baja y spend en el promedio o por debajo: puede ser que el anuncio no ' +
            'genere suficiente enganche para expandirse a audiencia nueva (frecuencia baja como ' +
            'síntoma, no como salud).',
        };
      }
      return {
        reason: 'healthy_prospecting',
        text:
          'Frecuencia baja, spend arriba del promedio, pocos cambios logueados: consistente con ' +
          'prospección sana, el anuncio sigue encontrando gente nueva.',
      };
    }

    if (freqDir === 'above') {
      if (cprDir === 'below' || ad.role === ROLES.BOFU) {
        return {
          reason: 'healthy_closing',
          text:
            'Frecuencia alta pero convierte bien (o es un anuncio de cierre): consistente con un ' +
            'anuncio que le sigue vendiendo bien a audiencia tibia — está bien que siga con ' +
            'presupuesto.',
        };
      }
      return {
        reason: 'possible_fatigue',
        text:
          'Frecuencia alta y no convierte mejor que el promedio: posible señal real de fatiga o ' +
          'audiencia agotada — no automáticamente, pero vale la pena vigilarlo.',
      };
    }

    return {
      reason: 'avg',
      text: 'Frecuencia en línea con el promedio de la cuenta.',
    };
  }

  global.FourPi = {
    ROLES,
    ROLE_LABELS,
    METRICS,
    PATTERNS,
    RESET_THRESHOLD,
    average,
    computeAverages,
    direction,
    classifyAd,
    diagnoseAd,
    readFrequency,
  };
})(window);
