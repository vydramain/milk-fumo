// Тестовый стаб: прямоугольник двигается по canvas кадрами.
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const SIZE = 20;
let x = 0;

function frame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#4a90d9";
  ctx.fillRect(x, (canvas.height - SIZE) / 2, SIZE, SIZE);
  x = (x + 1) % (canvas.width + SIZE);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
