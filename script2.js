const questionnaireForm = document.getElementById("questionnaireForm");
const successAnimation = document.getElementById("successAnimation");

questionnaireForm.addEventListener("submit", function(e) {
  e.preventDefault();

  // Vérifie que tous les champs sont remplis
  let allFilled = true;
  questionnaireForm.querySelectorAll("input").forEach(input => {
    if (!input.value.trim()) allFilled = false;
  });

  if (!allFilled) {
    alert("Merci de remplir tous les champs !");
    return;
  }

  // Affiche animation
  questionnaireForm.style.display = "none";
  successAnimation.style.display = "block";
});
