/*
 * Generated artwork: a monogram avatar for each bowler and a banner for each
 * team. Both are drawn from a hash of the name, so a given bowler or team
 * always gets the same colours — no image files to manage, no requests to an
 * outside avatar service, and it works offline.
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function node(name, attrs, children) {
    var element = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (key) {
      if (attrs[key] != null) element.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) { element.appendChild(child); });
    return element;
  }

  /* Stable across reloads and browsers — a plain string hash, not Math.random. */
  function hashOf(text) {
    var hash = 0;
    for (var i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  /* Fixed saturation and lightness keep every avatar in the same family and
     keep white text readable on all of them; only the hue varies. */
  function hsl(hue, saturation, lightness) {
    return 'hsl(' + (hue % 360) + ', ' + saturation + '%, ' + lightness + '%)';
  }

  function initials(name) {
    var words = String(name).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  var uid = 0;

  function player(name) {
    var hue = hashOf(name) % 360;
    var id = 'av' + (++uid);

    var gradient = node('linearGradient', { id: id, x1: '0', y1: '0', x2: '0', y2: '1' }, [
      node('stop', { offset: '0', 'stop-color': hsl(hue, 54, 48) }),
      node('stop', { offset: '1', 'stop-color': hsl(hue + 26, 56, 34) }),
    ]);

    var text = node('text', {
      x: 50, y: 50, 'text-anchor': 'middle', 'dominant-baseline': 'central',
      class: 'avatar-initials',
    });
    text.textContent = initials(name);

    var svg = node('svg', {
      viewBox: '0 0 100 100', class: 'avatar-art',
      role: 'img', 'aria-label': 'Monogram for ' + name,
    }, [
      node('defs', {}, [gradient]),
      node('circle', { cx: 50, cy: 50, r: 50, fill: 'url(#' + id + ')' }),
      /* A lane-ward sweep, so the circle is not a flat disc. */
      node('path', { d: 'M0 74 Q 50 40 100 74 L100 100 L0 100 Z', fill: '#fff', opacity: '.07' }),
      text,
    ]);

    return UI.el('span', { class: 'avatar' }, svg);
  }

  function banner(name) {
    var hue = hashOf(name) % 360;
    var id = 'bn' + (++uid);
    var stripes = 'st' + uid;

    var art = node('svg', {
      viewBox: '0 0 1200 260', preserveAspectRatio: 'xMidYMid slice',
      class: 'banner-art', 'aria-hidden': 'true', focusable: 'false',
    }, [
      node('defs', {}, [
        node('linearGradient', { id: id, x1: '0', y1: '0', x2: '1', y2: '1' }, [
          node('stop', { offset: '0', 'stop-color': hsl(hue, 58, 42) }),
          node('stop', { offset: '1', 'stop-color': hsl(hue + 34, 62, 26) }),
        ]),
        node('pattern', {
          id: stripes, width: 46, height: 46,
          patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(35)',
        }, [
          node('rect', { width: 46, height: 46, fill: 'transparent' }),
          node('rect', { width: 3, height: 46, fill: '#fff', opacity: '.06' }),
        ]),
      ]),
      node('rect', { width: 1200, height: 260, fill: 'url(#' + id + ')' }),
      node('rect', { width: 1200, height: 260, fill: 'url(#' + stripes + ')' }),
      /* Three balls rolling out of the corner. */
      node('circle', { cx: 1050, cy: 60, r: 130, fill: '#fff', opacity: '.06' }),
      node('circle', { cx: 1150, cy: 210, r: 80, fill: '#fff', opacity: '.05' }),
      node('circle', { cx: 190, cy: 250, r: 150, fill: '#000', opacity: '.07' }),
    ]);

    return art;
  }

  /* The same hue a team's banner uses, so a team keeps one identity colour
     everywhere it appears. Decorative only — it always sits beside the name,
     never carrying meaning on its own. */
  function colorFor(name) {
    return hsl(hashOf(name) % 360, 52, 42);
  }

  window.Avatars = {
    player: player, banner: banner, initials: initials, colorFor: colorFor,
  };
})();
