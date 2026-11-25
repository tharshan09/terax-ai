// Nachbardatei der Messseite: setzt Punkt 2 auf "ja", wenn sie geladen und ausgeführt wird.
(function () {
  var el = document.getElementById("c2");
  if (!el) return;
  el.textContent = "ja";
  el.classList.add("ok");
})();
