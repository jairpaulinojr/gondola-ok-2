window.addEventListener('DOMContentLoaded', () => {
    console.log("DOM carregado com sucesso!");
    if (typeof mostrarTelaLoginInicial === "function") {
        mostrarTelaLoginInicial();
    } else {
        document.querySelector(".container").innerHTML = "<h1>Erro: Função de login não encontrada</h1>";
    }
});

