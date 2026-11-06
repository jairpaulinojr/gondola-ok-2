 // ==========================================
 // 1. INICIALIZAÇÃO E CONEXÃO COM O SUPABASE
 // ==========================================
const SUPABASE_URL = 'https://jylcmvoynmmyvlpnkkhi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.DrMpI6lzyGx6-PBMPMEK1NWkBB7MsQol7NmaXpZc24w';

let supabaseClient = null;

if (window.supabase) {
    supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );
} else {
    console.error("Biblioteca Supabase não carregada.");
}

// ==========================================
// 2. MENU PRINCIPAL
// ==========================================
function voltarMenuPrincipal() {
    const container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo" style="background:#343a40;color:white;padding:20px;text-align:center;border-radius:8px 8px 0 0;">
            <h1>🏪 MENU OPERACIONAL</h1>
            <p>Selecione o módulo desejado</p>
        </div>
        <div style="padding:20px;text-align:center;background:#fff;border-radius:0 0 8px 8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
            <button onclick="abrirAbaValidade()" style="width:100%;padding:14px;margin:8px 0;background:#28a745;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">📅 Verificação de Validade</button>
            <button onclick="abrirColetorEtiquetas()" style="width:100%;padding:14px;margin:8px 0;background:#ffc107;color:#333;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">🏷️ Emissão de Etiquetas</button>
            <button onclick="abrirMonitoramentoEntregas()" style="width:100%;padding:14px;margin:8px 0;background:#17a2b8;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">🚚 Cadastro / Gestão de Entregas</button>
            <button onclick="abrirBuscaMissoesGlobal()" style="width:100%;padding:14px;margin:8px 0;background:#007bff;color:white;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">🔍 Busca de Missões / Base Global</button>
        </div>
    `;
}

// ==========================================
// 3. BUSCA GLOBAL DE PRODUTOS - CORRIGIDA
// ==========================================
async function buscarProdutoSupabase(codigoBarras) {
    const codigo = String(codigoBarras ?? "").trim();

    if (!codigo) {
        alert("Digite ou bipe um código de barras.");
        return null;
    }

    if (!supabaseClient) {
        console.error("Cliente Supabase não inicializado.");
        alert("Erro: conexão com Supabase não inicializada.");
        return null;
    }

    try {
        console.log("[BUSCA GLOBAL] Código recebido:", codigo);

        const { data, error } = await supabaseClient
            .from("cadastro_global")
            .select("*")
            .eq("CODIGO DE BARRAS", codigo)
            .limit(1);

        if (error) {
            console.error("[BUSCA GLOBAL] Erro:", error);
            alert("Erro na consulta: " + error.message);
            return null;
        }

        if (data && data.length > 0) {
            const produto = data[0];

            const codigoEncontrado =
                produto["CODIGO DE BARRAS"] ??
                produto["codigo de barras"] ??
                produto["codigo_barras"] ??
                produto["EAN"] ??
                produto["ean"] ??
                codigo;

            const descricaoEncontrada =
                produto["PRODUTO"] ??
                produto["produto"] ??
                produto["DESCRICAO"] ??
                produto["descricao"] ??
                "Produto sem descrição";

            console.log("[BUSCA GLOBAL] Produto encontrado:", produto);

            return {
                codigo: String(codigoEncontrado).trim(),
                descricao: String(descricaoEncontrada)
            };
        }

        console.warn(
            "[BUSCA GLOBAL] Código não encontrado pela busca exata:",
            codigo
        );

        // Diagnóstico: conferir se a tabela e as colunas estão acessíveis
        const { data: amostra, error: erroAmostra } =
            await supabaseClient
                .from("cadastro_global")
                .select("*")
                .limit(3);

        if (erroAmostra) {
            console.error(
                "[BUSCA GLOBAL] Erro ao ler tabela:",
                erroAmostra
            );
            alert("Não foi possível ler a tabela: " + erroAmostra.message);
            return null;
        }

        if (!amostra || amostra.length === 0) {
            console.warn("Tabela vazia ou registros não acessíveis.");
            alert(
                "A tabela cadastro_global não retornou registros. " +
                "Verifique os dados e as políticas de acesso."
            );
            return null;
        }

        console.log(
            "[BUSCA GLOBAL] Colunas existentes:",
            Object.keys(amostra[0])
        );

        console.log(
            "[BUSCA GLOBAL] Exemplos da tabela:",
            amostra
        );

        alert(
            "Produto não encontrado. Abra o console do navegador " +
            "para verificar os nomes das colunas e os exemplos retornados."
        );

        return null;

    } catch (erro) {
        console.error("[BUSCA GLOBAL] Falha inesperada:", erro);
        alert("Falha inesperada na busca: " + erro.message);
        return null;
    }
}

// ==========================================
// 4. MÓDULO DE VERIFICAÇÃO DE VALIDADE
// ==========================================
function abrirAbaValidade() {
    const container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo" style="background:#28a745;color:white;padding:15px;text-align:center;">
            <h1>📅 VERIFICAÇÃO DE VALIDADE</h1>
        </div>
        <div style="padding:20px;text-align:left;">
            <label style="font-weight:bold;">Código de Barras:</label>
            <input type="text" id="input-manual-code" placeholder="Bipe ou digite o código..." style="width:100%;padding:12px;margin:8px 0 15px;box-sizing:border-box;">
            <button onclick="processarBuscaValidade()" style="padding:12px;background:#28a745;color:white;width:100%;border:none;border-radius:5px;font-weight:bold;cursor:pointer;">🔍 VERIFICAR PRODUTO</button>
            <div id="resultado-validade" style="margin-top:20px;display:none;background:#f9f9f9;padding:15px;border-radius:5px;border:1px solid #ddd;"></div>
            <br>
            <button onclick="voltarMenuPrincipal()" style="background:#6c757d;color:white;width:100%;padding:12px;border:none;border-radius:5px;font-weight:bold;cursor:pointer;">⬅️ Voltar ao Menu</button>
        </div>
    `;

    setTimeout(() => {
        document.getElementById("input-manual-code")?.focus();
    }, 100);
}

async function processarBuscaValidade() {
    const campo = document.getElementById("input-manual-code");
    const display = document.getElementById("resultado-validade");

    if (!campo || !display) return;

    display.style.display = "block";
    display.innerHTML = "<p>🔍 Consultando cadastro global...</p>";

    const produto = await buscarProdutoSupabase(campo.value);

    if (!produto) {
        display.innerHTML = `
            <p style="color:red;text-align:center;">
                ❌ Produto não encontrado. Verifique o diagnóstico no console.
            </p>`;
        return;
    }

    display.innerHTML = `
        <p><strong>Produto:</strong> ${escaparHTML(produto.descricao)}</p>
        <p><strong>Código:</strong> ${escaparHTML(produto.codigo)}</p>
        <label style="font-weight:bold;">Data de Vencimento:</label>
        <input type="date" id="data-venc" style="width:100%;padding:10px;margin:8px 0 15px;box-sizing:border-box;">
        <label style="font-weight:bold;">Quantidade:</label>
        <input type="number" id="qtd-venc" value="1" min="1" style="width:100%;padding:10px;margin:8px 0 15px;box-sizing:border-box;">
        <button id="btn-salvar-validade" style="background:#28a745;color:white;width:100%;padding:12px;border:none;border-radius:5px;font-weight:bold;cursor:pointer;">
            💾 Salvar no Supabase
        </button>
    `;

    document.getElementById("btn-salvar-validade").onclick = () => {
        salvarValidadeSupabase(produto.codigo, produto.descricao);
    };
}

async function salvarValidadeSupabase(codigo, descricao) {
    const dataInput = document.getElementById("data-venc")?.value;
    const qtdInput = document.getElementById("qtd-venc")?.value;

    if (!dataInput) {
        alert("Escolha uma data de vencimento!");
        return;
    }

    const [ano, mes, dia] = dataInput.split("-");
    const dataFormatada = `${dia}/${mes}/${ano}`;

    if (!supabaseClient) {
        alert("Erro de conexão com Supabase.");
        return;
    }

    const registro = {
        descricao: descricao,
        "codigo de barras": String(codigo),
        validade: dataFormatada,
        quantidade: String(qtdInput)
    };

    const { error } = await supabaseClient
        .from("validade")
        .insert([registro]);

    if (error) {
        console.error("Erro ao salvar validade:", error);
        alert("Erro ao salvar validade: " + error.message);
        return;
    }

    alert("Validade gravada com sucesso!");
    abrirAbaValidade();
}

// ==========================================
// 5. MÓDULO DE EMISSÃO DE ETIQUETAS
// ==========================================
function abrirColetorEtiquetas() {
    const container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo" style="background:#ffc107;color:#333;padding:15px;text-align:center;">
            <h1>🏷️ EMISSÃO DE ETIQUETAS</h1>
        </div>
        <div style="padding:20px;text-align:left;">
            <label style="font-weight:bold;">Código de Barras:</label>
            <input id="input_coletor_etiqueta" placeholder="Bipe ou digite o código..." style="width:100%;padding:14px;margin:8px 0 15px;box-sizing:border-box;">
            <button onclick="processarBuscaEtiqueta()" style="width:100%;padding:14px;background:#28a745;color:white;border:0;border-radius:6px;font-weight:bold;cursor:pointer;">
                🔍 VERIFICAR E SOLICITAR ETIQUETA
            </button>
            <div id="resultado_busca_coletor" style="margin-top:20px;"></div>
            <button onclick="voltarMenuPrincipal()" style="width:100%;padding:12px;background:#6c757d;color:white;border:0;border-radius:6px;margin-top:20px;cursor:pointer;font-weight:bold;">
                ↩ Voltar ao Menu
            </button>
        </div>
    `;

    setTimeout(() => {
        document.getElementById("input_coletor_etiqueta")?.focus();
    }, 100);
}

async function processarBuscaEtiqueta() {
    const campo = document.getElementById("input_coletor_etiqueta");
    const resultado = document.getElementById("resultado_busca_coletor");

    if (!campo || !resultado) return;

    resultado.innerHTML = "<p>🔍 Buscando produto...</p>";

    const produto = await buscarProdutoSupabase(campo.value);

    if (!produto) {
        resultado.innerHTML = `
            <div style="background:#fff3cd;padding:15px;border-radius:6px;color:#856404;">
                ⚠️ Produto não localizado. Consulte o diagnóstico do Supabase.
            </div>`;
        return;
    }

    resultado.innerHTML = `
        <div style="background:#d4edda;padding:15px;border-radius:6px;color:#155724;">
            <strong>✅ PRODUTO LOCALIZADO</strong>
            <p style="font-weight:bold;font-size:16px;margin:5px 0;">${escaparHTML(produto.descricao)}</p>
            <small>Cód: ${escaparHTML(produto.codigo)}</small>
        </div>
        <button id="btn-confirmar-etiqueta" style="width:100%;padding:14px;background:#28a745;color:white;border:0;border-radius:6px;margin-top:15px;font-weight:bold;cursor:pointer;">
            💾 Confirmar e Enviar para Fila de Etiquetas
        </button>
    `;

    document.getElementById("btn-confirmar-etiqueta").onclick = () => {
        gerarSolicitacaoEtiqueta(produto.codigo, produto.descricao);
    };
}

async function gerarSolicitacaoEtiqueta(codigo, descricao) {
    if (!supabaseClient) {
        alert("Erro de conexão com o Supabase.");
        return;
    }

    const { error } = await supabaseClient
        .from("etiquetas_pendentes")
        .insert([{
            descricao: descricao,
            "codigo de barras": String(codigo)
        }]);

    if (error) {
        console.error("Erro ao gerar etiqueta:", error);
        alert("Erro ao enviar etiqueta: " + error.message);
        return;
    }

    alert("Etiqueta enviada para a fila de impressão!");
    abrirColetorEtiquetas();
}

// ==========================================
// 6. MÓDULO DE ENTREGAS
// ==========================================
function abrirMonitoramentoEntregas() {
    const container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo" style="background:#17a2b8;color:white;padding:15px;text-align:center;">
            <h1>🚚 CADASTRO DE ENTREGAS</h1>
        </div>
        <div style="padding:20px;text-align:left;">
            <div style="background:#f8f9fa;padding:15px;border-radius:6px;margin-bottom:15px;border:1px solid #ddd;">
                <h3>Nova Entrega</h3>
                <label>Cliente:</label>
                <input id="input_cliente_entrega" placeholder="Nome do cliente..." style="width:100%;padding:10px;margin:5px 0 10px;box-sizing:border-box;">
                <label>Cidade:</label>
                <input id="input_cidade_entrega" placeholder="Nome da cidade..." style="width:100%;padding:10px;margin:5px 0 10px;box-sizing:border-box;">
                <label>Bairro:</label>
                <input id="input_bairro_entrega" placeholder="Nome do bairro..." style="width:100%;padding:10px;margin:5px 0 10px;box-sizing:border-box;">
                <label>Rua:</label>
                <input id="input_rua_entrega" placeholder="Nome da rua..." style="width:100%;padding:10px;margin:5px 0 10px;box-sizing:border-box;">
                <label>Número:</label>
                <input id="input_numero_entrega" placeholder="Número..." style="width:100%;padding:10px;margin:5px 0 15px;box-sizing:border-box;">
                <button onclick="salvarNovaEntregaSupabase()" style="width:100%;padding:12px;background:#28a745;color:white;border:0;border-radius:5px;font-weight:bold;cursor:pointer;">
                    💾 Salvar Entrega na Nuvem
                </button>
            </div>
            <h3>Entregas Cadastradas</h3>
            <div id="lista_entregas_container">⏳ Carregando entregas...</div>
            <button onclick="voltarMenuPrincipal()" style="width:100%;padding:12px;background:#6c757d;color:white;border:0;border-radius:6px;margin-top:20px;cursor:pointer;font-weight:bold;">
                ↩ Voltar ao Menu
            </button>
        </div>
    `;

    carregarListaEntregasSupabase();
}

async function salvarNovaEntregaSupabase() {
    const cliente = document.getElementById("input_cliente_entrega")?.value.trim();
    const cidade = document.getElementById("input_cidade_entrega")?.value.trim();
    const bairro = document.getElementById("input_bairro_entrega")?.value.trim();
    const rua = document.getElementById("input_rua_entrega")?.value.trim();
    const numero = document.getElementById("input_numero_entrega")?.value.trim();

    if (!cliente || !cidade) {
        alert("Preencha pelo menos Cliente e Cidade!");
        return;
    }

    if (!supabaseClient) {
        alert("Erro de conexão com o Supabase.");
        return;
    }

    const { error } = await supabaseClient
        .from("entregas")
        .insert([{ cliente, cidade, bairro, rua, numero }]);

    if (error) {
        console.error("Erro ao salvar entrega:", error);
        alert("Erro ao salvar entrega: " + error.message);
        return;
    }

    alert("Entrega salva com sucesso!");
    abrirMonitoramentoEntregas();
}

async function carregarListaEntregasSupabase() {
    const lista = document.getElementById("lista_entregas_container");
    if (!lista) return;

    if (!supabaseClient) {
        lista.textContent = "Cliente Supabase não inicializado.";
        return;
    }

    const { data, error } = await supabaseClient
        .from("entregas")
        .select("*");

    if (error) {
        console.error("Erro ao carregar entregas:", error);
        lista.textContent = "Erro ao carregar entregas: " + error.message;
        return;
    }

    if (!data || data.length === 0) {
        lista.textContent = "Nenhuma entrega registrada.";
        return;
    }

    let html = `
        <table style="width:100%;border-collapse:collapse;background:white;font-size:13px;">
            <tr style="background:#f2f2f2;text-align:left;">
                <th style="padding:8px;">Cliente</th>
                <th style="padding:8px;">Endereço</th>
            </tr>`;

    data.forEach(item => {
        html += `
            <tr style="border-bottom:1px solid #ddd;">
                <td style="padding:8px;"><strong>${escaparHTML(item.cliente || "N/D")}</strong></td>
                <td style="padding:8px;">${escaparHTML(
                    [item.rua, item.numero, item.bairro, item.cidade]
                        .filter(Boolean).join(", ")
                )}</td>
            </tr>`;
    });

    html += "</table>";
    lista.innerHTML = html;
}

// ==========================================
// 7. BUSCA DE MISSÕES
// ==========================================
function abrirBuscaMissoesGlobal() {
    const container = document.querySelector(".container");
    if (!container) return;

    container.innerHTML = `
        <div class="topo" style="background:#007bff;color:white;padding:15px;text-align:center;">
            <h1>🔍 BUSCA DE MISSÕES / AUDITORIA</h1>
        </div>
        <div style="padding:15px;text-align:left;">
            <div style="background:#f8f9fa;padding:15px;border:1px solid #ddd;margin-bottom:15px;">
                <label>Loja:</label>
                <input id="filtro_loja" placeholder="Ex: MIRANDA MANHUMIRIM..." style="width:100%;padding:10px;margin:5px 0 10px;box-sizing:border-box;">
                <label>Setor:</label>
                <input id="filtro_setor" placeholder="Ex: seca básica, bebidas, açougue..." style="width:100%;padding:10px;margin:5px 0 10px;box-sizing:border-box;">
                <label>Produto / Descrição:</label>
                <input id="filtro_produto" placeholder="Digite o nome do produto..." style="width:100%;padding:10px;margin:5px 0 15px;box-sizing:border-box;">
                <button onclick="executarPesquisaMissoes()" style="width:100%;padding:12px;background:#007bff;color:white;border:0;border-radius:5px;font-weight:bold;cursor:pointer;">
                    🔍 PESQUISAR PRODUTOS
                </button>
            </div>
            <div id="resultado_busca_missoes">
                <p>Preencha os campos acima para realizar a busca.</p>
            </div>
            <button onclick="voltarMenuPrincipal()" style="width:100%;padding:12px;background:#6c757d;color:white;border:0;border-radius:6px;margin-top:20px;cursor:pointer;font-weight:bold;">
                ↩ Voltar ao Menu
            </button>
        </div>
    `;
}

async function buscarNaTabelaGlobalAvancada(filtroLoja, filtroSetor, termoProduto) {
    if (!supabaseClient) {
        alert("Cliente Supabase não inicializado.");
        return [];
    }

    try {
        let query = supabaseClient
            .from("missoes_tabela_global")
            .select("*");

        if (filtroLoja?.trim()) {
            query = query.ilike("loja", `%${filtroLoja.trim()}%`);
        }

        if (filtroSetor?.trim()) {
            query = query.ilike("setor", `%${filtroSetor.trim()}%`);
        }

        if (termoProduto?.trim()) {
            query = query.ilike("descricao", `%${termoProduto.trim()}%`);
        }

        const { data, error } = await query.limit(50);

        if (error) {
            console.error("Erro na busca de missões:", error);
            alert("Erro na busca de missões: " + error.message);
            return [];
        }

        return data || [];

    } catch (erro) {
        console.error("Falha na busca de missões:", erro);
        return [];
    }
}

async function executarPesquisaMissoes() {
    const loja = document.getElementById("filtro_loja")?.value || "";
    const setor = document.getElementById("filtro_setor")?.value || "";
    const produto = document.getElementById("filtro_produto")?.value || "";
    const resultado = document.getElementById("resultado_busca_missoes");

    if (!resultado) return;

    resultado.innerHTML = "<p>⏳ Buscando no Supabase...</p>";

    const resultados = await buscarNaTabelaGlobalAvancada(
        loja,
        setor,
        produto
    );

    if (resultados.length === 0) {
        resultado.innerHTML = `
            <p style="color:red;text-align:center;font-weight:bold;">
                Nenhum produto localizado com estes filtros.
            </p>`;
        return;
    }

    let html = `
        <p style="color:green;font-weight:bold;">
            Encontrado(s) ${resultados.length} item(ns):
        </p>
        <table style="width:100%;border-collapse:collapse;background:white;font-size:12px;">
            <tr style="background:#e9ecef;text-align:left;">
                <th style="padding:8px;">Produto</th>
                <th style="padding:8px;">Setor</th>
                <th style="padding:8px;">Loja</th>
            </tr>`;

    resultados.forEach(item => {
        html += `
            <tr style="border-bottom:1px solid #ddd;">
                <td style="padding:8px;">
                    <strong>${escaparHTML(item.descricao || "Sem descrição")}</strong><br>
                    <small>Cód: ${escaparHTML(
                        item["codigo de barras"] ?? item["CODIGO DE BARRAS"] ?? ""
                    )}</small>
                </td>
                <td style="padding:8px;">${escaparHTML(item.setor || "-")}</td>
                <td style="padding:8px;">${escaparHTML(item.loja || "-")}</td>
            </tr>`;
    });

    html += "</table>";
    resultado.innerHTML = html;
}

// ==========================================
// 8. PROTEÇÃO DE TEXTO EXIBIDO NA TELA
// ==========================================
function escaparHTML(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caractere => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[caractere]);
}
