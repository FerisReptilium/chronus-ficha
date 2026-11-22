/**
 * CHRONUS — Resolução narrativa canônica
 * Classifica a margem e define a autoridade de descrição da cena.
 * Não escreve a narrativa nem escolhe o preço do sucesso parcial.
 */
(function(root) {
  'use strict';

  const OUTCOMES = Object.freeze({
    exceptional_success: {
      label: 'Sucesso excepcional',
      authority: 'player',
      authorityLabel: 'Jogador',
      instruction: 'O jogador descreve a cena de forma épica.',
      acts: 1,
      condition: true
    },
    success: {
      label: 'Sucesso',
      authority: 'player',
      authorityLabel: 'Jogador',
      instruction: 'O jogador descreve como alcança o objetivo.',
      acts: 0,
      condition: false
    },
    partial_success: {
      label: 'Sucesso parcial',
      authority: 'shared',
      authorityLabel: 'Jogador e Narrador',
      instruction: 'Jogador e Narrador constroem a cena juntos; o Narrador acrescenta um preço ao sucesso.',
      narratorAddsPrice: true,
      acts: 0,
      condition: false
    },
    failure: {
      label: 'Falha',
      authority: 'narrator',
      authorityLabel: 'Narrador',
      instruction: 'O Narrador descreve o insucesso e suas consequências.',
      acts: 0,
      condition: false
    },
    critical_failure: {
      label: 'Falha crítica',
      authority: 'narrator',
      authorityLabel: 'Narrador',
      instruction: 'O Narrador descreve a falha de forma desastrosa e horrível.',
      acts: 1,
      condition: false
    }
  });

  function resolve(results, difficulty) {
    if (!Array.isArray(results) || results.length < 1) {
      throw new TypeError('A jogada precisa conter ao menos um resultado.');
    }
    if (!results.every(value => Number.isInteger(value) && value >= 1 && value <= 12)) {
      throw new RangeError('Os resultados devem ser inteiros entre 1 e 12.');
    }
    if (!Number.isFinite(difficulty)) {
      throw new TypeError('A dificuldade precisa ser numérica.');
    }

    const best = Math.max(...results);
    const margin = best - difficulty;
    let outcome;

    if (margin >= 3) outcome = 'exceptional_success';
    else if (margin >= 1) outcome = 'success';
    else if (margin === 0) outcome = 'partial_success';
    else if (margin >= -2) outcome = 'failure';
    else outcome = 'critical_failure';

    const rule = OUTCOMES[outcome];
    return {
      best,
      margin,
      outcome,
      label: rule.label,
      key: outcome,
      narrative: {
        authority: rule.authority,
        authorityLabel: rule.authorityLabel,
        instruction: rule.instruction,
        narratorAddsPrice: rule.narratorAddsPrice === true
      },
      consequences: {
        acts: rule.acts,
        condition: rule.condition
      },
      narratorRollsDice: false
    };
  }

  root.ChronusNarrativeRules = Object.freeze({ resolve, outcomes: OUTCOMES });
})(typeof window !== 'undefined' ? window : globalThis);
