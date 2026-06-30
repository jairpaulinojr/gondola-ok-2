// ==========================================
// 1. BANCOS DE DADOS SEPARADOS (Memória Local)
// ==========================================
let baseGlobalProdutos = JSON.parse(localStorage.getItem("gondola_base_global")) || []; 

// Estrutura para isolar a carga de missões por setor
let missoesPorSetor = JSON.parse(localStorage.getItem("gondola_missoes_setores")) || {
    "Mercearia Bebidas": [],
    "Mercearia Doce": [],
    "Mercearia Conservas": [],
    "Mercearia Alto Giro": [],
    "Mercearia Limpeza": [],
    "Frios Iogurte": [],
    "Frios Congelados": [],
    "Açougue": [],
    "Padaria": []
};

let produtosDoDia = [];        
let usuarioAtual = "";
let setorSelecionado = "";
let indiceAtual = 0;
let html5QrcodeScanner = null;
// ==========================================
// 1.5. FUNÇÃO DE EXPORTAÇÃO (UTILS)
// ==========================================
function exportarParaExcel(nomeArquivo, chaveLocalStorage) {
    let dados = JSON.parse(localStorage.getItem(chaveLocalStorage)) || [];
    if (dados.length === 0) {
        alert("Nenhum dado disponível para exportação!");
        return;
    }

    // Cria a planilha a partir dos dados do LocalStorage
    let ws = XLSX.utils.json_to_sheet(dados);
    let wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    
    // Baixa o arquivo
    XLSX.writeFile(wb, nomeArquivo + ".xlsx");
}
// ==========================================
// 2. PROCESSADOR DE CARGA DE EXCEL POR SETOR
// ==========================================
function carregarPlanilhaSetor(inputElement, nomeSetor) {
    let arquivo = inputElement.files[0];
    if (!arquivo) return;

    let leitor = new FileReader();
    leitor.onload = function(evento) {
        let dados = new Uint8Array(evento.target.result);
        let arquivoExcel = XLSX.read(dados, {type: 'array'});
        let json = XLSX.utils.sheet_to_json(arquivoExcel.Sheets[arquivoExcel.SheetNames[0]]);
        
        missoesPorSetor[nomeSetor] = json.map((item, idx) => {
            let codigoEncontrado = item["Cód. de Barras"] || item["codigo"] || item["Código"] || item["Codigo"] || "";
            let descricaoEncontrada = item["DESCRIÇÃO"] || item["descricao"] || item["Descrição"] || item["Descricao"] || "";

            return {
                id: Date.now() + idx, 
                codigo: String(codigoEncontrado).trim(),
                descricao: String(descricaoEncontrada).trim(),
                setor: nomeSetor,
                abastecido: null,
                precificado: null,
                statusRuptura: false,
                finalizacaoGerente: null
            };
        }).filter(p => p.codigo !== "" && p.descricao !== "");

        localStorage.setItem("gondola_missoes_setores", JSON.stringify(missoesPorSetor));
        alert(`Sucesso: ${missoesPorSetor[nomeSetor].length} itens carregados para a Missão de [${nomeSetor}]!`);
        abrirPainelAdmin(); 
    };
    leitor.readAsArrayBuffer(arquivo);
}

function carregarBaseGlobal(inputElement) {
    let arquivo = inputElement.files[0];
    if (!arquivo) return;

    let leitor = new FileReader();
    leitor.onload = function(evento) {
        let dados = new Uint8Array(evento.target.result);
        let arquivoExcel = XLSX.read(dados, {type: 'array'});
        let json = XLSX.utils.sheet_to_json(arquivoExcel.Sheets[arquivoExcel.SheetNames[0]]);
        
        baseGlobalProdutos = json.map(item => {
            let codigoEncontrado = item["Cód. de Barras"] || item["codigo"] || item["Código"] || item["Codigo"] || "";
            let descricaoEncontrada = item["DESCRIÇÃO"] || item["descricao"] || item["Descrição"] || item["Descricao"] || "";
            
            return {
                codigo: String(codigoEncontrado).trim(),
                descricao: String(descricaoEncontrada).trim(),
                setor: String(item.setor || 'Geral')
            };
        }).filter(p => p.codigo !== "" && p.descricao !== "");
        
        localStorage.setItem("gondola_base_global", JSON.stringify(baseGlobalProdutos));
        alert("🔥 Base Global Atualizada! " + baseGlobalProdutos.length + " produtos salvos.");
        abrirPainelAdmin(); 
    };
    leitor.readAsArrayBuffer(arquivo);
}

// ==========================================
// 3. FUNÇÃO DE LOGIN
// ==========================================
function entrar() {
    let campoNome = document.getElementById("nome");
    let campoMatricula = document.getElementById("matricula");

    if (!campoNome || !campoMatricula) {
        alert("Erro técnico: Elementos de login não encontrados.");
        return;
    }

    let nome = campoNome.value.trim();
    let matricula = campoMatricula.value.trim().toLowerCase();

    if (nome === "" || matricula === "") {
        alert("Preencha Nome e Matrícula.");
        return;
    }

    if (matricula === "admin" || nome.toLowerCase() === "admin") {
        usuarioAtual = "Administrador";
        abrirPainelAdmin();
        return; 
    } 
    
    usuarioAtual = nome;
    voltarMenuPrincipal();
}

function mostrarTelaLoginInicial() {
    let container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo">
            <h1>🛒 GÔNDOLA OK</h1>
            <p>Faça seu login para iniciar</p>
        </div>
        <div class="login">
            <label for="nome">Nome do Colaborador:</label>
            <input type="text" id="nome" placeholder="Digite seu nome completo">

            <label for="matricula">Matrícula / Senha:</label>
            <input type="password" id="matricula" placeholder="Digite sua matrícula (ou 'admin')">

            <button onclick="entrar()" style="background-color: #28a745; color: white;">Entrar no Sistema</button>
        </div>
    `;
}
// ==========================================
// 4. TELA DO ADMINISTRADOR (ATUALIZADA)
// ==========================================
function abrirPainelAdmin() {
    // 1. LÓGICA: O alerta só some quando o status for "Resolvido"
    let registros = JSON.parse(localStorage.getItem("registro_validades")) || [];
    let hoje = new Date();
    
    // Filtra itens que NÃO foram "Resolvidos" e vencem em até 15 dias
    let vencendoLogo = registros.filter(r => {
        if (r.status === "Resolvido") return false;
        
        // Verifica se a data é válida antes de processar
        if (!r.dataValidade) return false;
        
        let [d, m, a] = r.dataValidade.split('/');
        let dataVenc = new Date(a, m - 1, d);
        let diferencaDias = Math.ceil((dataVenc - hoje) / (1000 * 60 * 60 * 24));
        
        return diferencaDias >= 0 && diferencaDias <= 15;
    });

    let avisoHtml = "";
    if (vencendoLogo.length > 0) {
        avisoHtml = `
            <div style="background:#dc3545; color:white; padding:15px; margin-bottom:15px; border-radius:5px; text-align:center; font-weight:bold; border: 1px solid #a71d2a;">
                🚨 ATENÇÃO: ${vencendoLogo.length} item(ns) vencendo em até 15 dias!
            </div>
        `;
    }

    let setoresLista = [
        { nome: 'Mercearia Bebidas', icone: '🥤' }, { nome: 'Mercearia Doce', icone: '🍬' },
        { nome: 'Mercearia Conservas', icone: '🥫' }, { nome: 'Mercearia Alto Giro', icone: '🔄' },
        { nome: 'Mercearia Limpeza', icone: '🧴' }, { nome: 'Frios Iogurte', icone: '🥛' },
        { nome: 'Frios Congelados', icone: '🧊' }, { nome: 'Açougue', icone: '🥩' },
        { nome: 'Padaria', icone: '🍞' }
    ];

    let blocosInputsSetores = "";
    setoresLista.forEach(s => {
        let contagem = missoesPorSetor[s.nome] ? missoesPorSetor[s.nome].length : 0;
        blocosInputsSetores += `
            <div style="margin-bottom: 12px; border-bottom: 1px solid #f0f0f0; padding-bottom: 8px;">
                <label><strong>${s.icone} ${s.nome}</strong> (${contagem} itens)</label>
                <input type="file" onchange="carregarPlanilhaSetor(this, '${s.nome}')" style="width: 100%; font-size: 11px;">
            </div>
        `;
    });

    document.querySelector(".container").innerHTML = `
        ${avisoHtml}
        <div class="topo"><h1>⚙️ PAINEL DO ADMINISTRADOR</h1></div>
        <div class="login" style="text-align: left; max-width: 100%;">
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <button onclick="abrirMenuSetoresGerente()" style="background:#17a2b8; color:white; width:50%;">🔑 Auditorias</button>
                <button onclick="abrirRelatorioValidadesGerente()" style="background:#20c997; color:white; width:50%;">📅 Ver Validades</button>
            </div>
            ${blocosInputsSetores}
            <button onclick="location.reload()" style="background:#6c757d; color:white; width: 100%; margin-top: 10px;">Sair</button>
        </div>
    `;

}

// ==========================================
// 5. MENU PRINCIPAL DO REPOSITOR (USUÁRIO)
// ==========================================
function voltarMenuPrincipal() {
    if (html5QrcodeScanner) { 
        try { html5QrcodeScanner.clear(); } catch(e) {} 
    }

    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🛒 GÔNDOLA OK</h1>
            <p>Operador: <strong>${usuarioAtual || "Não Identificado"}</strong></p>
        </div>

        <div class="login">
            <h2>Selecione seu Setor</h2>
            <button onclick="prepararMissaoSetor('Mercearia Bebidas')">🥤 Mercearia Bebidas</button>
            <button onclick="prepararMissaoSetor('Mercearia Doce')">🍬 Mercearia Doce</button><br><br>
            <button onclick="prepararMissaoSetor('Mercearia Conservas')">🥫 Mercearia Conservas</button><br><br>
            <button onclick="prepararMissaoSetor('Mercearia Alto Giro')">🔄 Mercearia Alto Giro</button><br><br>
            <button onclick="prepararMissaoSetor('Mercearia Limpeza')">🧴 Mercearia Limpeza</button><br><br>
            <button onclick="prepararMissaoSetor('Frios Iogurte')">🥛 Frios Iogurte</button><br><br>
            <button onclick="prepararMissaoSetor('Frios Congelados')">🧊 Frios Congelados</button><br><br>
            <button onclick="prepararMissaoSetor('Açougue')">🥩 Açougue</button><br><br>
            <button onclick="prepararMissaoSetor('Padaria')">🍞 Padaria</button>
            
            <hr style="margin:20px 0; border:0; border-top:1px solid #ccc;">
            
            <h2>Serviços de Apoio</h2>
            <button onclick="abrirAbaValidade()" style="background:#20c997; color:white;">📅 Verificar Validade (Base Global)</button>
            <button onclick="abrirAbaEtiquetas()" style="background:#ffc107; color:black;">🏷️ Etiquetas Pendentes</button>
            <button onclick="location.reload()" style="background:#6c757d; color:white; margin-top: 15px;">⬅️ Sair do App</button>
        </div>
    `;
}

// ==========================================
// 6. SORTEIO ALEATÓRIO DA MISSÃO (MÁX 20 ITENS)
// ==========================================
function prepararMissaoSetor(setor) {
    setorSelecionado = setor;
    indiceAtual = 0;

    let todosDoSetor = missoesPorSetor[setor] || [];

    if (todosDoSetor.length === 0) {
        alert("Atenção: Nenhuma lista de missão foi carregada para o setor: " + setor);
        return;
    }

    let copiaProdutos = JSON.parse(JSON.stringify(todosDoSetor));

    for (let i = copiaProdutos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copiaProdutos[i], copiaProdutos[j]] = [copiaProdutos[j], copiaProdutos[i]];
    }

    produtosDoDia = copiaProdutos.slice(0, 20);
    mostrarProdutoAtual();
}

// ==========================================
// 7. CHECKLIST INTERATIVO DE LOJA
// ==========================================
function mostrarProdutoAtual() {
    if (indiceAtual >= produtosDoDia.length) {
        finalizarMissao();
        return;
    }

    let produto = produtosDoDia[indiceAtual];

    document.querySelector(".container").innerHTML = `
    <div class="topo">
        <h1>🛒 GÔNDOLA OK</h1>
        <p>${setorSelecionado} (${indiceAtual + 1}/${produtosDoDia.length})</p>
    </div>

    <div class="login">
        <p><strong>Código:</strong> ${produto.codigo}</p>
        <p><strong>Produto:</strong> ${produto.descricao}</p>
        <br>

        <h3>O produto está abastecido?</h3>
        <button id="btn-abs-sim" onclick="respostaAbastecido(true)" style="background-color: #e0e0e0; color: black; margin-bottom:8px;">🟢 SIM</button>
        <button id="btn-abs-nao" onclick="respostaAbastecido(false)" style="background-color: #e0e0e0; color: black; margin-bottom:8px;">🔴 NÃO</button>
        <br><br>

        <div id="bloco-preco" style="display: none;">
            <h3>Está precificado?</h3>
            <button id="btn-prc-sim" onclick="respostaPrecificado(true)" style="background-color: #e0e0e0; color: black; margin-bottom:8px;">🟢 SIM</button>
            <button id="btn-prc-nao" onclick="respostaPrecificado(false)" style="background-color: #e0e0e0; color: black; margin-bottom:8px;">🔴 NÃO</button>
            <br><br>
        </div>

        <button id="btn-proximo" style="display: none; background-color: #28a745; color: white; width: 100%; padding: 10px;" onclick="proximoProduto()">➡️ Avançar</button>
    </div>
    `;
}

function respostaAbastecido(valor) {
    let produto = produtosDoDia[indiceAtual];
    produto.abastecido = valor;

    document.getElementById("btn-abs-sim").style.background = valor ? "#28a745" : "#e0e0e0";
    document.getElementById("btn-abs-sim").style.color = valor ? "white" : "black";
    document.getElementById("btn-abs-nao").style.background = !valor ? "#dc3545" : "#e0e0e0";
    document.getElementById("btn-abs-nao").style.color = !valor ? "white" : "black";

    let blocoPreco = document.getElementById("bloco-preco");
    let btnProximo = document.getElementById("btn-proximo");

    if (valor === true) {
        produto.statusRuptura = false;
        blocoPreco.style.display = "block";
        btnProximo.style.display = "none";
    } else {
        produto.statusRuptura = true;
        produto.precificado = "Bloqueado por Ruptura";
        blocoPreco.style.display = "none";
        btnProximo.style.display = "block";
    }
}

function respostaPrecificado(valor) {
    let produto = produtosDoDia[indiceAtual];
    produto.precificado = valor;

    document.getElementById("btn-prc-sim").style.background = valor ? "#28a745" : "#e0e0e0";
    document.getElementById("btn-prc-sim").style.color = valor ? "white" : "black";
    document.getElementById("btn-prc-nao").style.background = !valor ? "#dc3545" : "#e0e0e0";
    document.getElementById("btn-prc-nao").style.color = !valor ? "white" : "black";

    if (valor === false) {
        let etiquetas = JSON.parse(localStorage.getItem("etiquetas_pendentes")) || [];
        if (!etiquetas.some(e => e.codigo === produto.codigo)) {
            etiquetas.push(produto);
            localStorage.setItem("etiquetas_pendentes", JSON.stringify(etiquetas));
        }
    }
    document.getElementById("btn-proximo").style.display = "block";
}

function proximoProduto() {
    indiceAtual++;
    mostrarProdutoAtual();
}

// ==========================================
// 8. FINALIZAÇÃO DA MISSÃO DIÁRIA
// ==========================================
function finalizarMissao() {
    let historico = JSON.parse(localStorage.getItem("gondola_dados")) || [];
    let produtosMapeados = produtosDoDia.map(p => ({
        ...p,
        operador: usuarioAtual,
        dataAuditoria: new Date().toLocaleDateString()
    }));

    historico = historico.concat(produtosMapeados);
    localStorage.setItem("gondola_dados", JSON.stringify(historico));

    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🛒 GÔNDOLA OK</h1>
            <h2>Setor Concluído!</h2>
        </div>
        <div class="login" style="text-align: center;">
            <p>Parabéns! A auditoria dos 20 itens foi concluída.</p>
            <button onclick="voltarMenuPrincipal()" style="background-color: #6c757d; color: white;">Voltar ao Menu</button>
        </div>
    `;
}

// ==========================================
// 9. REPOSITOR: ABA VALIDADE (PRODUTOS)
// ==========================================
function abrirAbaValidade() {
    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>📅 VERIFICAÇÃO DE VALIDADE</h1>
        </div>
        <div class="login" style="max-width:100%;">
            <div id="leitor-camera" style="width: 100%; max-width: 350px; margin: 0 auto;"></div>
            <br>
            <input type="text" id="input-manual-code" placeholder="Ou digite o código de barras">
            <button onclick="buscarProdutoValidade(document.getElementById('input-manual-code').value)" style="padding:8px; margin-top:5px; background:#6c757d; color:white; width:100%;">Buscar Manual</button>
            <div id="resultado-validade" style="margin-top: 20px; display:none; text-align:left; background:#f9f9f9; padding:15px; border-radius:5px;"></div>
            <br>
            <button onclick="voltarMenuPrincipal()" style="background:#6c757d; color:white; width:100%;">Voltar ao Menu</button>
        </div>
    `;

    html5QrcodeScanner = new Html5QrcodeScanner("leitor-camera", { fps: 10, qrbox: 250 });
    html5QrcodeScanner.render((txtCodigo) => {
        try { html5QrcodeScanner.clear(); } catch(e) {}
        buscarProdutoValidade(txtCodigo);
    }, (erro) => {});
}

// --- SUBSTITUA APENAS DAQUI PARA BAIXO NO SEU ARQUIVO ---

function buscarProdutoValidade(codigoBarras) {
    let baseMestre = JSON.parse(localStorage.getItem("gondola_base_global")) || [];
    let produtoEncontrado = baseMestre.find(p => p.codigo === codigoBarras.trim());

    let display = document.getElementById("resultado-validade");
    display.style.display = "block";

    if (!produtoEncontrado) {
        display.innerHTML = `<p style="color:red; text-align:center;">❌ Produto não localizado no Cadastro Mestre Global Mensal.</p>`;
        return;
    }

    display.innerHTML = `
        <p><strong>Produto:</strong> ${produtoEncontrado.descricao}</p>
        <p><strong>Código:</strong> ${produtoEncontrado.codigo}</p>
        <label><strong>Data de Vencimento:</strong></label>
        <input type="date" id="data-venc" style="width:100%; padding:8px; margin: 10px 0;">
        <label><strong>Quantidade:</strong></label>
        <input type="number" id="qtd-venc" value="1" style="width:100%; padding:8px; margin: 10px 0;">
        <button onclick="salvarDataValidade('${produtoEncontrado.codigo}', '${produtoEncontrado.descricao.replace(/'/g, "\\'")}')" style="background:#28a745; color:white; width:100%;">Salvar Data e Qtd</button>
    `;
}

function salvarDataValidade(codigo, descricao) {
    let data = document.getElementById("data-venc").value;
    let qtd = document.getElementById("qtd-venc").value; // Captura o valor do input
    if(!data) { alert("Escolha uma data!"); return; }
    
    let registros = JSON.parse(localStorage.getItem("registro_validades")) || [];
    
    let partes = data.split("-");
    let dataFormatada = `${partes[2]}/${partes[1]}/${partes[0]}`;

    registros.push({ 
        codigo: codigo, 
        descricao: descricao,
        dataValidade: dataFormatada,
        quantidade: qtd, // Salva o número digitado
        status: "Pendente", // Incluído para o filtro do Gerente reconhecer o item
        dataRegistro: new Date().toLocaleDateString() 
    });
    localStorage.setItem("registro_validades", JSON.stringify(registros));
    
    alert("Salvo! Quantidade: " + qtd);
    abrirAbaValidade(); 
}

// ==========================================
// 10. REPOSITOR: ABA PREÇOS (MANUAL)
// ==========================================
function abrirAbaEtiquetas() {
    let etiquetas = JSON.parse(localStorage.getItem("etiquetas_pendentes")) || [];
    let linhas = "";

    if (etiquetas.length === 0) {
        linhas = `<tr><td colspan="2" style="text-align:center; padding:20px; color: green; font-weight: bold;">🎉 Nenhum produto sem preço pendente!</td></tr>`;
    } else {
        etiquetas.forEach((e, idx) => {
            linhas += `
                <tr style="border-bottom: 1px solid #ddd;">
                    <td style="padding:12px; font-size:14px; line-height: 1.4;">
                        <strong>${e.descricao}</strong><br>
                        <span style="font-family: monospace; font-size: 15px; color: #333; background: #eee; padding: 2px 6px; border-radius: 3px;">
                            ${e.codigo}
                        </span>
                    </td>
                    <td style="padding:12px; text-align:center; width: 90px;">
                        <button onclick="darBaixaEtiquetaManual(${idx})" style="background:#28a745; color:white; padding:8px 10px; font-size:12px; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">
                            ✓ Feito
                        </button>
                    </td>
                </tr>
            `;
        });
    }

    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🏷️ PRODUTOS SEM PREÇO</h1>
            <p>Copie o código para emitir manualmente no seu sistema</p>
        </div>
        <div class="login" style="max-width:100%; padding: 0;">
            <div style="background: #e2e3e5; padding: 10px; border-radius: 5px; margin-bottom: 15px; font-size: 13px; color: #383d41; text-align: center;">
                📋 <strong>Total pendente: ${etiquetas.length} itens</strong>
            </div>
            
            <table style="width:100%; border-collapse:collapse; text-align:left; background: white;">
                <thead>
                    <tr style="background:#f2f2f2; border-bottom: 2px solid #ccc;">
                        <th style="padding:10px; font-size: 13px;">Produto / Código de Barras</th>
                        <th style="padding:10px; text-align:center; font-size: 13px;">Ação</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
            <br>
            <button onclick="voltarMenuPrincipal()" style="background:#6c757d; color:white; width:100%;">⬅️ Voltar ao Menu</button>
        </div>
    `;
}

function darBaixaEtiquetaManual(index) {
    let etiquetas = JSON.parse(localStorage.getItem("etiquetas_pendentes")) || [];
    etiquetas.splice(index, 1);
    localStorage.setItem("etiquetas_pendentes", JSON.stringify(etiquetas));
    abrirAbaEtiquetas();
}

// ==========================================
// 11. GESTÃO DE VALIDADES: GERENTE
// ==========================================
function abrirRelatorioValidadesGerente() {
    let todosRegistros = JSON.parse(localStorage.getItem("registro_validades")) || [];
    let registros = todosRegistros.filter(r => r.status !== "Resolvido"); 
    let linhas = "";

    registros.forEach((r, index) => {
        let estiloTratado = r.status === "Tratado" ? "background:#e8f4fd;" : "background:#ffffff;";
        let qtd = r.quantidade || 1; 

        // Em vez de colocar a lógica no onclick, chamamos uma função que lê os dados da linha
        linhas += `
            <tr style="${estiloTratado} border-bottom: 1px solid #ddd; font-size: 13px;">
                <td style="padding: 10px;"><strong>${r.descricao}</strong><br><small>Cód: ${r.codigo}</small></td>
                <td style="padding: 10px; text-align:center; color:red; font-weight:bold;">${r.dataValidade}</td>
                <td style="padding: 10px; text-align:center;">${qtd}</td>
                <td style="padding: 10px; text-align:center;">
                    <button onclick="executarAcao('${r.codigo}', '${r.dataValidade}', 'Tratado')" style="background:#007bff; color:white; border:none; padding:5px; margin:2px; cursor:pointer;">Tratar</button>
                    <button onclick="executarAcao('${r.codigo}', '${r.dataValidade}', 'Resolvido')" style="background:#28a745; color:white; border:none; padding:5px; margin:2px; cursor:pointer;">Resolver</button>
                </td>
            </tr>
        `;
    });

    document.querySelector(".container").innerHTML = `
        <div class="topo"><h1>📅 GESTÃO DE VALIDADES</h1></div>
        <div class="login" style="max-width: 100%; padding: 10px;">
            <button onclick="exportarParaExcel('Relatorio_Validades', 'registro_validades')" style="width:100%; background:#6c757d; color:white; padding:10px; margin-bottom:10px;">📥 Exportar para Excel</button>
            <table style="width: 100%; border-collapse: collapse;">
                <tr style="background:#f2f2f2;"><th style="padding:8px;">Prod</th><th style="padding:8px;">Venc</th><th style="padding:8px;">Qtd</th><th style="padding:8px;">Ação</th></tr>
                ${linhas}
            </table>
            <button onclick="abrirPainelAdmin()" style="width:100%; margin-top:10px;">Voltar</button>
        </div>
    `;
}

// NOVA FUNÇÃO "PONTE" PARA EVITAR ERROS DE SINTAXE NO HTML
function executarAcao(codigo, data, status) {
    console.log("Tentando atualizar:", codigo, data, status);
    atualizarStatus(codigo, data, status);
}

// ==========================================
// 11.5. FUNÇÃO GLOBAL (GARANTIA DE FUNCIONAMENTO)
// ==========================================
window.atualizarStatus = function(codigo, dataValidade, novoStatus) {
    let registros = JSON.parse(localStorage.getItem("registro_validades")) || [];
    let item = registros.find(r => r.codigo === codigo && r.dataValidade === dataValidade);
    
    if (item) {
        item.status = novoStatus;
        localStorage.setItem("registro_validades", JSON.stringify(registros));
        alert("Status: " + novoStatus);
        abrirRelatorioValidadesGerente();
    } else {
        alert("Erro ao localizar item.");
    }
}

// ==========================================
// 12. GERENTE: SELEÇÃO DE ABAS AUDITORIA
// ==========================================
function abrirMenuSetoresGerente() {
    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🔑 RELATÓRIOS POR SETOR</h1>
            <p>Escolha o setor para auditar o dia</p>
        </div>
        <div class="login">
            <button onclick="abrirAbaGerente('Mercearia Bebidas')" style="background:#007bff; color:white;">🥤 Mercearia Bebidas</button>
            <button onclick="abrirAbaGerente('Mercearia Doce')" style="background:#007bff; color:white;">🍬 Mercearia Doce</button>
            <button onclick="abrirAbaGerente('Mercearia Conservas')" style="background:#007bff; color:white;">🥫 Mercearia Conservas</button>
            <button onclick="abrirAbaGerente('Mercearia Alto Giro')" style="background:#007bff; color:white;">🔄 Mercearia Alto Giro</button>
            <button onclick="abrirAbaGerente('Mercearia Limpeza')" style="background:#007bff; color:white;">🧴 Mercearia Limpeza</button>
            <button onclick="abrirAbaGerente('Frios Iogurte')" style="background:#007bff; color:white;">🥛 Frios Iogurte</button>
            <button onclick="abrirAbaGerente('Frios Congelados')" style="background:#007bff; color:white;">🧊 Frios Congelados</button>
            <button onclick="abrirAbaGerente('Açougue')" style="background:#007bff; color:white;">🥩 Açougue</button>
            <button onclick="abrirAbaGerente('Padaria')" style="background:#007bff; color:white;">🍞 Padaria</button>
            
            <hr style="margin: 20px 0; border: 0; border-top: 1px solid #ccc;">
            <button onclick="abrirPainelAdmin()" style="background-color: #6c757d; color: white; width: 100%;">Voltar ao Painel Admin</button>
        </div>
    `;
}
// ==========================================
// 13. GERENTE: VISUALIZAÇÃO DE RESULTADOS AUDITORIA
// ==========================================
function abrirAbaGerente(setorFiltro) {
    let dados = JSON.parse(localStorage.getItem("gondola_dados")) || [];
    let itensVistoriadosDoSetor = dados.filter(p => p.setor === setorFiltro);

    let linesTabela = "";
    if (itensVistoriadosDoSetor.length === 0) {
        linesTabela = `<tr><td colspan="3" style="padding:15px; text-align:center; color:#666;">Nenhum item vistoriado hoje neste setor.</td></tr>`;
    } else {
        itensVistoriadosDoSetor.forEach(p => {
            let statusAbs = p.abastecido ? "<span style='color:green; font-weight:bold;'>🟢 OK</span>" : "<span style='color:red; font-weight:bold;'>🔴 RUPTURA</span>";
            let statusPrc = p.precificado === true ? "🟢 Sim" : (p.precificado === false ? "🔴 Não" : "⚠️ N/A");

            linesTabela += `
                <tr style="border-bottom: 1px solid #ddd; font-size: 12px;">
                    <td style="padding: 10px;">${p.descricao}<br><small style="color:#777;">Cód: ${p.codigo}</small></td>
                    <td style="padding: 10px; text-align:center;">Abs: ${statusAbs}<br>Preço: ${statusPrc}</td>
                    <td style="padding: 10px;">
                        ${p.statusRuptura ? `
                            <select onchange="salvarDecisaoGerente('${setorFiltro}', ${p.id}, this.value)" style="padding: 4px; font-size:11px; width: 100%;">
                                <option value="">Definir motivo...</option>
                                <option value="Estoque Zerado" ${p.finalizacaoGerente === 'Estoque Zerado' ? 'selected' : ''}>❌ Estoque Zerado</option>
                                <option value="Não Abastecido" ${p.finalizacaoGerente === 'Não Abastecido' ? 'selected' : ''}>⚠️ Não Abastecido</option>
                                <option value="Somente no Sistema" ${p.finalizacaoGerente === 'Somente no Sistema' ? 'selected' : ''}>💻 No Sistema</option>
                            </select>
                        ` : `<span style="color:gray; font-size:11px;">Sem tratativa</span>`}
                    </td>
                </tr>
            `;
        });
    }

    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>📊 AUDITORIA: ${setorFiltro.toUpperCase()}</h1>
            <p>Resultados da amostragem diária</p>
        </div>
        <div class="login" style="max-width: 100%; padding: 10px;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; background:white;">
                <thead>
                    <tr style="background-color: #f2f2f2; font-size:12px;">
                        <th style="padding: 10px;">Produto</th>
                        <th style="padding: 10px; text-align:center;">Status Loja</th>
                        <th style="padding: 10px;">Tratativa Ruptura</th>
                    </tr>
                </thead>
                <tbody>${linesTabela}</tbody>
            </table>
            <br>
            <button onclick="abrirMenuSetoresGerente()" style="background-color: #6c757d; color: white; width: 100%;">Voltar aos Setores</button>
        </div>
    `;
}

function salvarDecisaoGerente(setorOrigem, idProd, motivo) {
    let dados = JSON.parse(localStorage.getItem("gondola_dados")) || [];
    let item = dados.find(p => p.id === idProd);
    if (item) {
        item.finalizacaoGerente = motivo;
        localStorage.setItem("gondola_dados", JSON.stringify(dados));
        // Recarrega a tela para manter o select selecionado
        abrirAbaGerente(setorOrigem);
    
    }
// ==========================================
// 14. GESTOR: LISTA DE ETIQUETAS PENDENTES
// ==========================================
function abrirGestaoEtiquetas() {
    let etiquetas = JSON.parse(localStorage.getItem("etiquetas_pendentes")) || [];
    let linhas = "";

    if (etiquetas.length === 0) {
        linhas = `<tr><td colspan="2" style="padding:15px; text-align:center; color:#666;">Nenhuma etiqueta pendente!</td></tr>`;
    } else {
        etiquetas.forEach((e, index) => {
            linhas += `
                <tr style="border-bottom: 1px solid #ddd; font-size: 13px;">
                    <td style="padding: 10px;">
                        <strong>${e.descricao}</strong><br>
                        <small style="color:#666;">Cód: ${e.codigo}</small>
                    </td>
                    <td style="padding: 10px; text-align:center;">
                        <button onclick="removerEtiqueta(${index})" style="background:#28a745; color:white; border:none; padding:6px; border-radius:3px; cursor:pointer;">Resolvido</button>
                    </td>
                </tr>
            `;
        });
    }

    document.querySelector(".container").innerHTML = `
        <div class="topo">
            <h1>🏷️ LISTA DE PRECIFICAÇÃO</h1>
            <p>Itens sem etiqueta na gôndola</p>
        </div>
        <div class="login" style="max-width: 100%; padding: 10px;">
            <button onclick="gerarEtiquetasCodigoBarras(JSON.parse(localStorage.getItem('etiquetas_pendentes')))" 
                    style="background:#007bff; color:white; width:100%; margin-bottom:10px; padding:12px; font-weight:bold; border:none; border-radius:3px; cursor:pointer;">
                🖨️ Imprimir Etiquetas
            </button>
            
            <table style="width: 100%; border-collapse: collapse; background:white; margin-bottom:15px;">
                <tr style="background:#f2f2f2; font-size:12px;">
                    <th style="padding:8px;">Produto</th>
                    <th style="padding:8px; text-align:center;">Ação</th>
                </tr>
                ${linhas}
            </table>
            
            <button onclick="abrirMenuSetoresGerente()" style="background-color: #6c757d; color: white; width: 100%; padding:10px;">⬅️ Voltar ao Menu</button>
        </div>
    `;
}

function removerEtiqueta(index) {
    let etiquetas = JSON.parse(localStorage.getItem("etiquetas_pendentes")) || [];
    etiquetas.splice(index, 1);
    localStorage.setItem("etiquetas_pendentes", JSON.stringify(etiquetas));
    abrirGestaoEtiquetas();
}

// ==========================================
// 15. ENGINE DE IMPRESSÃO (JsBarcode)
// ==========================================
// Adicione isto exatamente no final do seu script.js
window.gerarEtiquetasCodigoBarras = function(lista) {
    if (!lista || lista.length === 0) { 
        alert("Nenhum item para imprimir!"); 
        return; 
    }
    
    let janela = window.open('', '_blank');
    let html = `<html><head><style>
        body { font-family: Arial; }
        .etiqueta { display:inline-block; width: 45%; margin: 5px; padding: 10px; border: 1px solid #000; text-align: center; }
    </style></head><body>`;
    
    lista.forEach(p => {
        html += `<div class="etiqueta"><strong>${p.descricao}</strong><br><svg id="b${p.codigo}"></svg></div>`;
    });
    
    html += `<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
    <script>window.onload=()=>{
        ${lista.map(p => `JsBarcode("#b${p.codigo}", "${p.codigo}", {width:2, height:40, fontSize:12});`).join('')}
        window.print();
    }</script></body></html>`;
    
    janela.document.write(html);
    janela.document.close();
};

}


// EXECUÇÃO INICIAL MANDATÓRIA AO CARREGAR A PÁGINA
mostrarTelaLoginInicial();