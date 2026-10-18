/*
 * The "make a picture to share" panel used by the shot tracker.
 *
 * panel({ label, filename, title, make, pdf }) is a button; pressing it calls
 * make() for a picture ({ svg, width, height } from cards.js), draws a preview
 * and offers Share, Save image and, when asked for, Download PDF. The picture
 * is built only on demand, so the pages stay quick.
 */
(function () {
  'use strict';

  var el = UI.el;

  function btn(text, onclick, kind) {
    return el('button', { type: 'button', class: 'sh-btn' + (kind ? ' is-' + kind : ''), onclick: onclick }, text);
  }

  function panel(opts) {
    var root = el('div', { class: 'sh-share' });
    var state = { step: 'idle', message: '', url: null, blob: null };

    function release() {
      if (state.url) { URL.revokeObjectURL(state.url); state.url = null; }
      state.blob = null;
    }

    function show() {
      UI.clear(root);
      if (state.step === 'idle') {
        UI.append(root, [btn(opts.label, make, opts.kind || null), state.message ? el('p', { class: 'sh-error', role: 'alert', text: state.message }) : null]);
        return;
      }
      if (state.step === 'working') {
        UI.append(root, el('p', { class: 'sh-note', text: 'Drawing the picture…' }));
        return;
      }
      var name = opts.filename;
      UI.append(root, [
        el('img', { class: 'sh-share-preview' + (opts.tall ? ' is-tall' : ''), src: state.url, alt: opts.title || 'Preview' }),
        el('div', { class: 'sh-actions' }, [
          btn('Share', function () { done(window.Cards.shareOrSave(state.blob, name + '.png', opts.title)); }, 'primary'),
          btn('Save image', function () { window.Cards.download(state.blob, name + '.png'); note('Saved ' + name + '.png'); }),
          opts.pdf ? btn('Download PDF', pdf) : null,
          btn('Close', function () { release(); state.step = 'idle'; state.message = ''; show(); }),
        ]),
        el('p', { class: 'sh-note', role: 'status', text: state.message }),
      ]);
    }

    function note(text) {
      state.message = text;
      var p = root.querySelector('[role=status]');
      if (p) p.textContent = text;
    }

    function done(promise) {
      promise.then(function (how) {
        note(how === 'shared' ? 'Shared.' : how === 'cancelled' ? '' : 'Saved to this device.');
      });
    }

    function pdf() {
      note('Making the PDF…');
      window.Cards.toPdf(state.picture).then(function (blob) {
        window.Cards.download(blob, opts.filename + '.pdf');
        note('Saved ' + opts.filename + '.pdf');
      }, function (e) { note(e.message); });
    }

    function make() {
      release();
      state.step = 'working';
      state.message = '';
      show();
      /* Let the "drawing" note paint before the heavy work starts. */
      setTimeout(function () {
        var picture;
        try { picture = opts.make(); } catch (e) { picture = { error: e.message }; }
        if (!picture || picture.error) {
          state.step = 'idle';
          state.message = (picture && picture.error) || 'Nothing to draw yet.';
          return show();
        }
        state.picture = picture;
        window.Cards.rasterize(picture, 'image/png', undefined, 2).then(function (r) {
          state.blob = r.blob;
          state.url = URL.createObjectURL(r.blob);
          state.step = 'ready';
          show();
        }, function (e) {
          state.step = 'idle';
          state.message = e.message;
          show();
        });
      }, 30);
    }

    show();
    return root;
  }

  window.ShotsShare = { panel: panel };
})();
