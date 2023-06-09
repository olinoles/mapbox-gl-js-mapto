import {test} from '../../util/test.js';
import fs from 'fs';
import {globSync} from 'glob';
import path from 'path';
import validate from '../../../src/style-spec/validate_style.js';
import v8 from '../../../src/style-spec/reference/v8.json';
import migrate from '../../../src/style-spec/migrate.js';

/* eslint-disable import/namespace */
import * as spec from '../../../src/style-spec/style-spec.js';

import {fileURLToPath} from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const UPDATE = !!process.env.UPDATE;

test('does not migrate from version 5', (t) => {
    t.throws(() => {
        migrate({version: 5, layers: []});
    }, new Error('cannot migrate from', 5));
    t.end();
});

test('does not migrate from version 6', (t) => {
    t.throws(() => {
        migrate({version: 6, layers: []});
    }, new Error('cannot migrate from', 6));
    t.end();
});

test('migrates to latest version from version 7', (t) => {
    t.deepEqual(migrate({version: 7, layers: []}).version, spec.latest.$version);
    t.end();
});

test('converts token strings to expressions', (t) => {
    const migrated = migrate({
        version: 8,
        layers: [{
            id: '1',
            type: 'symbol',
            layout: {'text-field': 'a{x}', 'icon-image': '{y}'}
        }]
    }, spec.latest.$version);
    t.deepEqual(migrated.layers[0].layout['text-field'], ['concat', 'a', ['get', 'x']]);
    t.deepEqual(migrated.layers[0].layout['icon-image'], ['to-string', ['get', 'y']]);
    t.end();
});

test('converts stop functions to expressions', (t) => {
    const migrated = migrate({
        version: 8,
        layers: [{
            id: '1',
            type: 'background',
            paint: {
                'background-opacity': {
                    base: 1.0,
                    stops: [[0, 1], [10, 0.72]]
                }
            }
        }, {
            id: '2',
            type: 'background',
            paint: {
                'background-opacity': {
                    base: 1.0,
                    stops: [[0, [1, 2]], [10, [0.72, 0.98]]]
                }
            }
        }]
    }, spec.latest.$version);
    t.deepEqual(migrated.layers[0].paint['background-opacity'], [
        'interpolate',
        ['linear'],
        ['zoom'],
        0,
        1,
        10,
        0.72
    ]);
    t.deepEqual(migrated.layers[1].paint['background-opacity'], [
        'interpolate',
        ['linear'],
        ['zoom'],
        0,
        ['literal', [1, 2]],
        10,
        ['literal', [0.72, 0.98]]
    ]);
    t.end();
});

test('converts categorical function on resolvedImage type to valid expression', (t) => {
    const migrated = migrate({
        version: 8,
        sources: {
            streets: {
                url: 'mapbox://mapbox.streets',
                type: 'vector'
            }
        },
        layers: [{
            id: '1',
            source: 'streets',
            'source-layer': 'labels',
            type: 'symbol',
            layout: {
                'icon-image': {
                    base: 1,
                    type: 'categorical',
                    property: 'type',
                    stops: [['park', 'some-icon']]
                }
            }
        }]
    }, spec.latest.$version);
    t.deepEqual(migrated.layers[0].layout['icon-image'], [
        "match",
        ["get", "type" ],
        "park",
        "some-icon",
        ""
    ]);
    t.deepEqual(validate(migrated, v8), []);
    t.end();
});

globSync(`${__dirname}/fixture/v7-migrate/*.input.json`).forEach((file) => {
    test(path.basename(file), (t) => {
        const outputfile = file.replace('.input', '.output');
        const style = JSON.parse(fs.readFileSync(file));
        const result = migrate(style);
        t.deepEqual(validate(result, v8), []);
        if (UPDATE) fs.writeFileSync(outputfile, JSON.stringify(result, null, 2));
        const expect = JSON.parse(fs.readFileSync(outputfile));
        t.deepEqual(result, expect);
        t.end();
    });
});
