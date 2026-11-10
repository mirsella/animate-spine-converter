const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SpineAnimation } = require('../.scratch/tests/spine/SpineAnimation.js');
const { SpineAnimationHelper } = require('../.scratch/tests/spine/SpineAnimationHelper.js');
const { SpineBone } = require('../.scratch/tests/spine/SpineBone.js');
const { SpineTransformMatrix } = require('../.scratch/tests/spine/transform/SpineTransformMatrix.js');
const { SpineFormatV3_8_99 } = require('../.scratch/tests/spine/formats/SpineFormatV3_8_99.js');
const { SpineFormatV4_0_00 } = require('../.scratch/tests/spine/formats/SpineFormatV4_0_00.js');
const { SpineFormatV4_1_00 } = require('../.scratch/tests/spine/formats/SpineFormatV4_1_00.js');
const { SpineFormatV4_2_00 } = require('../.scratch/tests/spine/formats/SpineFormatV4_2_00.js');
const fixtures = require('./fixtures/fire-spirit-mirror-keys.json');

function exportKeys(keys, { frameRate = 30, frame = {}, setup = {} } = {}) {
    const animation = new SpineAnimation();
    const bone = Object.assign(new SpineBone(), {
        name: 'mirror', x: 0, y: 0, rotation: 0,
        scaleX: 1, scaleY: 1, shearX: 0, shearY: 0
    }, setup);
    const context = {
        global: { frameRate },
        frame: { tweenType: 'classic', tweenEasing: 0, ...frame }
    };
    for (const key of keys) {
        SpineAnimationHelper.applyBoneAnimation(animation, bone, context, {
            x: key.time * 10, y: key.time * 5, rotation: key.time * 30,
            scaleX: key.x * bone.scaleX, scaleY: key.y * bone.scaleY,
            shearX: key.time, shearY: key.time * 2
        }, key.time);
    }
    return animation.bones[0];
}

// Values copied from the four original Fire Spirit attack exports, before repair.
// The FLA has opposite reflection determinants on these adjacent 30 fps poses.
for (const fixture of fixtures) {
    test(`preserves the discrete mirror: ${fixture.name}`, () => {
        const timeline = exportKeys(fixture.keys).findTimeline('scale');
        const result = new SpineFormatV4_2_00().convertTimeline(timeline);
        assert.equal(result[0].curve, 'stepped');
        assert.deepEqual(result.map(({ time = 0, x = 1, y = 1 }) => ({ time, x, y })), fixture.keys);
        assert.ok(!('curve' in result[1]), 'last key has no outgoing interpolation');
    });
}

test('the original Animate flame matrices export without a flattened halfway pose', () => {
    const first = SpineTransformMatrix.decomposeMatrix({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
    const second = SpineTransformMatrix.decomposeMatrix({ a: -1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, first);
    const timeline = exportKeys([
        { time: 0, x: first.scaleX, y: first.scaleY },
        { time: 1 / 30, x: second.scaleX, y: second.scaleY }
    ]).findTimeline('scale');
    const [start, end] = new SpineFormatV4_2_00().convertTimeline(timeline);
    // At 60 fps, the old linear export produced 1 + (-1 - 1) * 0.5 = 0.
    const halfway = start.curve === 'stepped' ? start.x : start.x + (end.x - start.x) * 0.5;
    assert.equal(halfway, 1);
    assert.equal(end.x, -1);
});

test('steps only scale, preserving rotation, position and shear easing', () => {
    const points = [{ x: 0, y: 0 }, { x: 0.25, y: 0.1 }, { x: 0.75, y: 0.9 }, { x: 1, y: 1 }];
    const group = exportKeys([{ time: 0, x: 1, y: 1 }, { time: 1 / 30, x: -1, y: 1 }], {
        frame: { hasCustomEase: true, getCustomEase: () => points }
    });
    const format = new SpineFormatV4_2_00();
    assert.equal(format.convertTimeline(group.findTimeline('scale'))[0].curve, 'stepped');
    for (const type of ['rotate', 'translate', 'shear']) {
        assert.deepEqual(format.convertTimeline(group.findTimeline(type))[0].curve, [0.25, 0.1, 0.75, 0.9]);
    }
});

test('preserves mirrors when motion-tween frames have been baked into samples', () => {
    const group = exportKeys(fixtures[1].keys, { frame: { tweenType: 'motion' } });
    assert.equal(group.findTimeline('scale').frames[0].curve, 'stepped');
    assert.equal(group.findTimeline('translate').frames[0].curve, null);
});

for (const keys of [
    [{ time: 0, x: 1, y: 1 }, { time: 1 / 30, x: 1.2, y: 0.8 }],
    [{ time: 0, x: -1, y: -1 }, { time: 1 / 30, x: -1.2, y: -0.8 }],
    [{ time: 0, x: 1, y: 1 }, { time: 1 / 30, x: 0, y: 1 }, { time: 2 / 30, x: -1, y: 1 }],
    [{ time: 0, x: 1, y: 1 }, { time: 0.6, x: -1, y: 1 }]
]) {
    test(`leaves an ordinary or explicitly authored scale tween unchanged: ${JSON.stringify(keys)}`, () => {
        const timeline = exportKeys(keys).findTimeline('scale');
        assert.ok(timeline.frames.every(frame => frame.curve === null));
    });
}

for (const frameRate of [24, 29.97, 30, 60, 120]) {
    test(`uses the source document rate (${frameRate} fps), not a hardcoded 30 fps`, () => {
        const group = exportKeys([{ time: 2, x: 1, y: 1 }, { time: 2 + 1 / frameRate, x: -1, y: 1 }], { frameRate });
        assert.equal(group.findTimeline('scale').frames[0].curve, 'stepped');
    });
}

test('supports negative/non-unit setup scales and repeated visits to the same key', () => {
    const group = exportKeys([
        { time: 0, x: 1, y: 1 },
        { time: 1 / 30, x: -1, y: 1 },
        { time: 1 / 30, x: -1, y: 1 }
    ], { setup: { scaleX: -2, scaleY: 3 } });
    const frames = group.findTimeline('scale').frames;
    assert.equal(frames.length, 2);
    assert.equal(frames[0].curve, 'stepped');
    assert.equal(frames[1].x, -1);
});

for (const Format of [SpineFormatV3_8_99, SpineFormatV4_0_00, SpineFormatV4_1_00, SpineFormatV4_2_00]) {
    test(`retains the repair in Spine ${new Format().version} JSON`, () => {
        const timeline = exportKeys(fixtures[1].keys).findTimeline('scale');
        assert.equal(new Format().convertTimeline(timeline)[0].curve, 'stepped');
    });
}
