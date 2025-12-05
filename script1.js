// ------------------------
// Toggle mot de passe
// ------------------------
const togglePwd = document.getElementById("togglePwd");
const passwordInput = document.getElementById("password");

togglePwd.addEventListener("click", () => {
  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    togglePwd.setAttribute("aria-pressed", "true");
  } else {
    passwordInput.type = "password";
    togglePwd.setAttribute("aria-pressed", "false");
  }
});

// ------------------------
// Effacer l'erreur quand on tape
// ------------------------
const lastnameInput = document.getElementById("lastname");
const firstnameInput = document.getElementById("firstname");

lastnameInput.addEventListener("input", () => {
  const errorElem = lastnameInput.parentElement.querySelector(".error");
  errorElem.textContent = "";
});

// ------------------------
// Génération aléatoire 0-4
// ------------------------
function random0to4() {
  return Math.floor(Math.random() * 5);
}

// ------------------------
// Validation formulaire
// ------------------------
const form = document.getElementById("signupForm");

form.addEventListener("submit", function(e) {
  e.preventDefault(); // éviter l'envoi normal

  let valid = true;

  const errorElem = lastnameInput.parentElement.querySelector(".error");

  if (random0to4() !== 0) {
    errorElem.textContent = `Le nom est déjà pris`;
    valid = false;
  } else {
    errorElem.textContent = "";
  }

  // Autres validations HTML5 sont déjà gérées par 'required', 'minlength', etc.

  if (valid) {
    // tout est ok -> ouvrir form2.html
    window.location.href = "form2.html";
  }
});
