// The documentation viewer (see scripts/build-docs.mjs): theme, navigation on small screens,
// search and the "on this page" highlight. Loaded in <head> so the theme applies before the page
// is drawn; the rest waits for the document.

(function () {
  // The app records its theme here (src/utils/docs.ts); the toggle below changes it for both.
  var THEME_KEY = 'nd-docs-theme';
  var html = document.documentElement;

  var storage = {
    get: function (key) {
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    set: function (key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (e) {
        /* Private mode or blocked storage: the choice lasts for this page only. */
      }
    },
  };

  var theme = storage.get(THEME_KEY);
  if (theme === 'dark' || theme === 'light') {
    html.setAttribute('data-theme', theme);
  }

  var isDark = function () {
    var explicit = html.getAttribute('data-theme');
    return explicit ? explicit === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  };

  document.addEventListener('DOMContentLoaded', function () {
    var root = html.getAttribute('data-root') || '';

    document.querySelector('.theme-toggle').addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      storage.set(THEME_KEY, next);
    });

    // --- Navigation on small screens ------------------------------------------------------------
    var menu = document.querySelector('.menu-toggle');
    var setNav = function (open) {
      document.body.classList.toggle('nav-open', open);
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? 'Hide navigation' : 'Show navigation');
    };
    menu.addEventListener('click', function () {
      setNav(!document.body.classList.contains('nav-open'));
    });
    document.querySelector('.sidebar').addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });
    // Tapping the page beside the open navigation closes it.
    document.querySelector('.scrim').addEventListener('click', function () {
      setNav(false);
    });

    var current = document.querySelector('.sidebar [aria-current="page"]');
    if (current) current.scrollIntoView({ block: 'center' });

    // --- Search ---------------------------------------------------------------------------------
    var input = document.querySelector('.search input');
    var list = document.getElementById('search-results');
    var results = [];
    var active = -1;

    var escape = function (s) {
      return s.replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    };
    var mark = function (text, terms) {
      var out = escape(text);
      terms.forEach(function (t) {
        out = out.replace(new RegExp('(' + escape(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
      });
      return out;
    };
    var snippet = function (text, terms) {
      var lower = text.toLowerCase();
      var at = lower.indexOf(terms[0]);
      if (at < 0) return text.slice(0, 140);
      var start = Math.max(0, at - 60);
      return (start > 0 ? '…' : '') + text.slice(start, start + 160) + (start + 160 < text.length ? '…' : '');
    };

    var search = function (query) {
      var terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return [];
      var found = [];
      (window.ND_DOCS_INDEX || []).forEach(function (page) {
        var title = page.t.toLowerCase();
        var text = page.x.toLowerCase();
        var score = 0;
        var heading = null;
        for (var i = 0; i < terms.length; i++) {
          var term = terms[i];
          var termScore = 0;
          if (title.indexOf(term) >= 0) termScore += title === term ? 40 : 20;
          page.h.forEach(function (h) {
            if (h.t.toLowerCase().indexOf(term) >= 0) {
              termScore += 6;
              if (!heading) heading = h;
            }
          });
          var hits = text.split(term).length - 1;
          termScore += Math.min(hits, 10);
          if (!termScore) return; // Every word has to appear somewhere.
          score += termScore;
        }
        found.push({ page: page, score: score, heading: heading, terms: terms });
      });
      return found
        .sort(function (a, b) {
          return b.score - a.score;
        })
        .slice(0, 10);
    };

    var render = function () {
      list.innerHTML = results.length
        ? results
            .map(function (r, i) {
              var href = root + r.page.u + (r.heading ? '#' + r.heading.id : '');
              return (
                '<li role="option" id="result-' + i + '"' + (i === active ? ' aria-selected="true"' : '') + '>' +
                '<a href="' + href + '">' +
                '<span class="result-title">' + mark(r.page.t, r.terms) + (r.heading ? ' <span class="result-heading">› ' + mark(r.heading.t, r.terms) + '</span>' : '') + '</span>' +
                (r.page.s ? '<span class="result-path">' + escape(r.page.s) + '</span>' : '') +
                '<span class="result-text">' + mark(snippet(r.page.x, r.terms), r.terms) + '</span>' +
                '</a></li>'
              );
            })
            .join('')
        : '<li class="empty">No pages match “' + escape(input.value.trim()) + '”</li>';
      var open = input.value.trim().length > 0;
      list.hidden = !open;
      input.setAttribute('aria-expanded', String(open));
      if (active >= 0) {
        input.setAttribute('aria-activedescendant', 'result-' + active);
        var el = document.getElementById('result-' + active);
        if (el) el.scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    };

    input.addEventListener('input', function () {
      results = search(input.value);
      active = results.length ? 0 : -1;
      render();
    });
    input.addEventListener('focus', function () {
      if (input.value.trim()) render();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!results.length) return;
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
        render();
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault();
        list.querySelectorAll('a')[active].click();
      } else if (e.key === 'Escape') {
        if (input.value) {
          input.value = '';
          results = [];
          render();
        } else {
          input.blur();
        }
      }
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.search')) list.hidden = true;
    });
    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        input.focus();
        input.select();
      } else if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
        setNav(false);
      }
    });

    // --- On this page ---------------------------------------------------------------------------
    var links = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
    var headings = links
      .map(function (a) {
        return document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
      })
      .filter(Boolean);
    // The section being read: the last heading in the top third of the window or above it.
    var highlight = function () {
      var line = window.innerHeight / 3;
      var currentHeading = headings
        .filter(function (h) {
          return h.getBoundingClientRect().top < line;
        })
        .pop();
      links.forEach(function (a) {
        a.classList.toggle('active', !!currentHeading && a.getAttribute('href') === '#' + currentHeading.id);
      });
    };
    if (headings.length) {
      var pending = false;
      window.addEventListener(
        'scroll',
        function () {
          if (pending) return;
          pending = true;
          window.requestAnimationFrame(function () {
            pending = false;
            highlight();
          });
        },
        { passive: true }
      );
      highlight();
    }
  });
})();
