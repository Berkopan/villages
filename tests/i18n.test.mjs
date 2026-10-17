import test from 'node:test';
import assert from 'node:assert/strict';
import { getLanguage, setLanguage, t } from '../src/ui/i18n.js';

test('supports Turkish and English without changing unknown names', () => {
  const previous = getLanguage();
  try {
    assert.equal(setLanguage('tr'), true);
    assert.equal(t('Yeni dünya'), 'Yeni dünya');
    assert.equal(setLanguage('en'), true);
    assert.equal(t('Yeni dünya'), 'New world');
    assert.equal(t('Söğüt Vadisi'), 'Söğüt Vadisi');
    assert.equal(t('Kuzey Tepesi'), 'Kuzey Tepesi');
    assert.equal(setLanguage('fr'), false);
    assert.equal(getLanguage(), 'en');
  } finally {
    setLanguage(previous);
  }
});

test('translates generated labels and pre-existing chronicle text', () => {
  const previous = getLanguage();
  try {
    setLanguage('en');
    assert.equal(t('Yıl 3 · Kış · 5. gün'), 'Year 3 · Winter · Day 5');
    assert.equal(t('Yıl 1 · İlkbahar'), 'Year 1 · Spring');
    assert.equal(t('15 olay'), '15 events');
    assert.equal(t('8 kişi'), '8 people');
    assert.equal(t('Ayşe doğdu'), 'Ayşe was born');
    assert.equal(t('Ada yaşamını yitirdi'), 'Ada died');
    assert.match(t('45 insan yeni bir coğrafyada. İhtiyaçları, yakınlıkları ve ürettikleri kaynaklar bu dünyanın tarihini yazacak.'), /45 people/);
    assert.equal(t('  Dünya defteri  '), '  World journal  ');
  } finally {
    setLanguage(previous);
  }
});

test('does not alter simulation data or require browser globals', () => {
  const previous = getLanguage();
  try {
    setLanguage('en');
    const event = { title: 'Yeni bir aile bağı', description: 'Ayla ile Deniz birlikte yaşamaya başladı.' };
    assert.equal(t(event.title), 'A new family bond');
    assert.equal(t(event.description), 'Ayla and Deniz started living together.');
    assert.equal(event.title, 'Yeni bir aile bağı');
    assert.equal(event.description, 'Ayla ile Deniz birlikte yaşamaya başladı.');
  } finally {
    setLanguage(previous);
  }
});
