import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import readXlsx from 'read-excel-file/universal';
import { fileKind, normalizePhone, parseDelimited, parsePasted, parseVcf, rowsToContacts } from '../src/lib/import-contacts.ts';

describe('normalizePhone', () => {
  it('keeps international numbers and applies the default country code to local ones', () => {
    assert.equal(normalizePhone('+509 3700-1234'), '+50937001234');
    assert.equal(normalizePhone('00509 37001234'), '+50937001234');
    assert.equal(normalizePhone('3700 1234', '509'), '+50937001234');
    assert.equal(normalizePhone('50937001234', '509'), '+50937001234'); // already has the code
    assert.equal(normalizePhone('037001234', '+509'), '+50937001234'); // trunk zero dropped
    assert.equal(normalizePhone('+1 (305) 555-1234', '509'), '+13055551234'); // + wins over the default
  });
  it('rejects junk', () => {
    assert.equal(normalizePhone('abc'), null);
    assert.equal(normalizePhone('123'), null);
    assert.equal(normalizePhone(''), null);
  });
});

describe('parseDelimited', () => {
  it('detects ; , and tab, handles quotes and a BOM', () => {
    assert.deepEqual(parseDelimited('﻿nom;tel\nJean;+509 1\n'), [['nom', 'tel'], ['Jean', '+509 1']]);
    assert.deepEqual(parseDelimited('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
    assert.deepEqual(parseDelimited('name,phone\n"Dupont, Jean","+50937001234"\n"Say ""hi""",x'), [['name', 'phone'], ['Dupont, Jean', '+50937001234'], ['Say "hi"', 'x']]);
  });
});

describe('rowsToContacts', () => {
  it('uses a header (any language / column order) and combines first and last name', () => {
    const r = rowsToContacts(parseDelimited('Prénom;Nom de famille;Téléphone\nJean;Baptiste;3700 1234\nMarie;;+50937009999'), '509');
    assert.deepEqual(r.contacts, [{ phone: '+50937001234', name: 'Jean Baptiste' }, { phone: '+50937009999', name: 'Marie' }]);
  });
  it('works without a header, with the phone first or second', () => {
    assert.deepEqual(parsePasted('Jean, +50937001234\nMarie, +50937009999').contacts.map((c) => c.name), ['Jean', 'Marie']);
    assert.deepEqual(parsePasted('+50937001234\n+50937009999').contacts, [{ phone: '+50937001234' }, { phone: '+50937009999' }]);
  });
  it('counts duplicates, reports invalid numbers and accepts numeric spreadsheet cells', () => {
    const r = rowsToContacts([['phone'], [50937001234], ['+509 3700 1234'], ['abc'], [null]], '509');
    assert.deepEqual(r, { contacts: [{ phone: '+50937001234' }], duplicates: 1, invalid: ['abc'], total: 3 });
  });
  it('accepts a copied spreadsheet (tab separated)', () => {
    assert.equal(parsePasted('Nom\tTel\nJean\t+50937001234').contacts[0]?.name, 'Jean');
  });
});

describe('parseVcf', () => {
  it('reads FN/N, several phones per card, folded lines and typed TEL entries', () => {
    const vcf = ['BEGIN:VCARD', 'VERSION:3.0', 'N:Baptiste;Jean;;;', 'TEL;TYPE=CELL:+509 3700 1234', 'item1.TEL:+50937009999', 'END:VCARD',
      'BEGIN:VCARD', 'FN:Marie', ' Joseph', 'TEL;type=pref:tel:+50938001111', 'EMAIL:x@y.z', 'END:VCARD',
      'BEGIN:VCARD', 'FN:Sans numéro', 'END:VCARD'].join('\r\n');
    assert.deepEqual(rowsToContacts(parseVcf(vcf)).contacts, [
      { phone: '+50937001234', name: 'Jean Baptiste' }, { phone: '+50937009999', name: 'Jean Baptiste' }, { phone: '+50938001111', name: 'MarieJoseph' },
    ]);
  });
});

describe('fileKind', () => {
  it('picks the parser from the extension', () => {
    assert.deepEqual([fileKind('a.XLSX'), fileKind('b.vcf'), fileKind('c.csv'), fileKind('d.txt')], ['xlsx', 'vcf', 'text', 'text']);
  });
});

describe('xlsx (same reader the page uses)', () => {
  it('reads the first sheet that has rows, with numeric phone cells', async () => {
    const buf = await readFile(new URL('./fixtures/contacts.xlsx', import.meta.url));
    const sheets = await readXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    const rows = (sheets.find((s) => s.data.length)?.data ?? []) as unknown[][];
    const r = rowsToContacts(rows, '509');
    assert.deepEqual(r.contacts, [{ phone: '+50937001234', name: 'Jean Baptiste' }, { phone: '+50937005678', name: 'Marie' }]);
    assert.deepEqual(r.invalid, ['abc']);
  });
});
