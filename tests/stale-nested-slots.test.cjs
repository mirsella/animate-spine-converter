const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Converter } = require('../.scratch/tests/core/Converter.js');
const { ConverterContext } = require('../.scratch/tests/core/ConverterContext.js');
const { ConverterMap } = require('../.scratch/tests/core/ConverterMap.js');
const { SpineAnimation } = require('../.scratch/tests/spine/SpineAnimation.js');
const { SpineAnimationHelper } = require('../.scratch/tests/spine/SpineAnimationHelper.js');
const { SpineSkeleton } = require('../.scratch/tests/spine/SpineSkeleton.js');
const { SpineTimelineType } = require('../.scratch/tests/spine/types/SpineTimelineType.js');

const FPS = 30;

// One Animate layer whose keyframe at frame 12 swaps the nested symbol
// `base_to_active` (inner layers base3, base1) for `base_active` (inner layers
// base2, base1), as in the Hidden Tower FLA before the artist renamed base2 to base3.
function hiddenTowerRig() {
    const skeleton = new SpineSkeleton();
    const root = skeleton.createBone('root');
    const layerBone = skeleton.createBone('anim', root);
    const slots = {};
    for (const name of ['base3', 'base1', 'base2']) {
        slots[name] = skeleton.createSlot(`anim___${name}_slot`, skeleton.createBone(`anim___${name}`, layerBone));
    }
    const outsider = skeleton.createSlot('other_slot', skeleton.createBone('other', root));
    const layer = { name: 'anim_hidden_tower_base_active' };
    const global = {
        skeleton,
        animation: new SpineAnimation(),
        layerBonesCache: new ConverterMap(),
        layerKeyedSlotsCache: new ConverterMap(),
        attachmentKeySerial: 0,
        frameRate: FPS,
        labels: [{ name: 'a' }, { name: 'b' }]
    };
    global.layerBonesCache.set(layer, [layerBone]);
    const context = { global, bone: root, recursionDepth: 0, symbolPath: '', timeOffset: 0, time: 0, frame: { startFrame: 0, tweenType: 'none' } };
    const key = (slot, name, frame) => {
        context.time = frame / FPS;
        SpineAnimationHelper.applySlotAttachment(global.animation, slot, context, name ? { name } : null, frame / FPS);
    };
    const converter = Object.create(Converter.prototype);
    const convertFrame = (frame, keys) => {
        const serialBefore = global.attachmentKeySerial;
        for (const [slot, name] of keys) key(slot, name, frame);
        converter.hideSlotsNotKeyedSince(context, layer, serialBefore, frame / FPS);
    };
    const attachmentKeys = (slot) => global.animation.findSlotTimeline(slot)
        .findTimeline(SpineTimelineType.ATTACHMENT).frames
        .map((f) => [Math.round(f.time * FPS), f.name]);
    const switchAnimation = (index) => ConverterContext.prototype.switchContextAnimation.call(context, global.labels[index]);
    return { slots, outsider, key, convertFrame, attachmentKeys, switchAnimation };
}

test('hides the previous nested symbol\'s layers when a keyframe swaps the symbol', () => {
    const { slots, convertFrame, attachmentKeys } = hiddenTowerRig();
    for (let frame = 0; frame < 12; frame++) {
        convertFrame(frame, [[slots.base3, frame < 2 ? 'base3' : 'base5'], [slots.base1, 'base1']]);
    }
    convertFrame(12, [[slots.base2, 'base2'], [slots.base1, 'base1']]);
    convertFrame(13, [[slots.base2, 'base2'], [slots.base1, 'base1']]);

    const base3 = attachmentKeys(slots.base3);
    assert.deepEqual(base3[base3.length - 1], [12, null], 'base3 is hidden once base_active replaces base_to_active');
    assert.equal(base3.filter(([, name]) => name == null).length, 1, 'hidden once, not re-keyed every frame');
    assert.deepEqual(attachmentKeys(slots.base2)[0], [0, null]);
    assert.ok(attachmentKeys(slots.base1).every(([, name]) => name === 'base1'), 'continuing layer stays visible');
});

test('keeps slots a same-named sibling layer showed at the same time, and slots outside the layer', () => {
    const { slots, outsider, key, convertFrame, attachmentKeys } = hiddenTowerRig();
    convertFrame(0, [[slots.base3, 'base3']]);
    key(outsider, 'other', 0);
    // A sibling layer sharing this layer's bone keys base3 at frame 1 before this layer runs.
    key(slots.base3, 'base3', 1);
    key(outsider, 'other', 1);
    convertFrame(1, [[slots.base1, 'base1']]);

    assert.deepEqual(attachmentKeys(slots.base3), [[0, 'base3'], [1, 'base3']]);
    assert.deepEqual(attachmentKeys(outsider), [[0, 'other'], [1, 'other']]);
});

test('keeps a slot a same-named sibling layer holds from an earlier keyframe', () => {
    const { slots, key, convertFrame, attachmentKeys } = hiddenTowerRig();
    // A static sibling layer sharing this layer's bone keys base2 once and holds it.
    key(slots.base2, 'base2', 0);
    convertFrame(0, [[slots.base1, 'base1']]);
    convertFrame(1, [[slots.base1, 'base1']]);

    assert.deepEqual(attachmentKeys(slots.base2), [[0, 'base2']]);
});

test('forgets which slots a layer keyed when the next animation starts', () => {
    const { slots, key, convertFrame, attachmentKeys, switchAnimation } = hiddenTowerRig();
    switchAnimation(0);
    convertFrame(0, [[slots.base2, 'base2'], [slots.base1, 'base1']]);
    // In the next label only a same-named sibling layer shows base2.
    switchAnimation(1);
    key(slots.base2, 'base2', 0);
    convertFrame(0, [[slots.base1, 'base1']]);
    convertFrame(1, [[slots.base1, 'base1']]);

    assert.deepEqual(attachmentKeys(slots.base2), [[0, 'base2']]);
});
