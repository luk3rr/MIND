# Filename: strings.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""User-interface texts in pt-BR, kept in one place (NFR-13)."""

from __future__ import annotations

APP_NAME = "MIND"

# (slug, label) of the sidebar sections, in display order.
SECTIONS: list[tuple[str, str]] = [
    ("today", "Hoje"),
    ("library", "Biblioteca"),
    ("generate", "Gerar"),
    ("study", "Estudar"),
    ("stats", "Estatísticas"),
    ("chat", "Chat"),
    ("settings", "Configurações"),
]

T: dict[str, str] = {
    "skip_link": "Pular para o conteúdo",
    "toggle_theme": "Alternar tema claro/escuro",
    "workspace": "Workspace",
    "new_workspace": "Novo workspace",
    "workspace_name": "Nome do workspace",
    "create": "Criar",
    "rename": "Renomear",
    "delete": "Excluir",
    "delete_confirm_label": "Para excluir, digite o nome do workspace",
    "delete_warning": (
        "Isso apaga materiais, itens e progresso deste workspace. Não há como desfazer."
    ),
    "welcome_title": "Boas-vindas ao MIND",
    "welcome_text": "Crie seu primeiro workspace para organizar um assunto de estudo.",
    "today_title": "Hoje",
    "today_empty": "Nada para estudar ainda.",
    "today_steps": "Primeiros passos",
    "step_import": "Importe um material na Biblioteca.",
    "step_generate": "Gere flashcards ou questões em Gerar.",
    "step_study": "Estude a fila do dia aqui.",
    "soon_title": "Em breve",
    "soon_text": "Esta seção será liberada em uma próxima etapa do desenvolvimento.",
    "error_title": "Algo deu errado",
    "back_home": "Voltar ao início",
    "main_nav": "Navegação principal",
    "provider_nav": "Provedor de IA",
    "setup_banner": "Configure o provedor de IA para gerar flashcards e questões.",
    "setup_banner_link": "Configurar",
    "setup_title": "Configurar o provedor de IA",
    "setup_step_1": "Passo 1 de 2: chave e modelos",
    "setup_step_2": "Passo 2 de 2: privacidade",
    "api_key": "Chave de API do OpenRouter",
    "api_key_help": (
        "A chave é gravada só no arquivo .env deste computador e nunca é exibida de volta."
    ),
    "key_status_none": "Nenhuma chave configurada.",
    "key_status_file": "Chave configurada (arquivo .env).",
    "key_status_environment": "Chave configurada (variável de ambiente).",
    "key_replace_hint": "Deixe em branco para manter a chave atual.",
    "key_remove": "Remover chave",
    "generation_model": "Modelo para gerar",
    "judge_model": "Modelo para verificar",
    "monthly_limit": "Limite mensal de custo (US$)",
    "save": "Salvar",
    "usd": "US$",
    "continue": "Continuar",
    "privacy_title": "O que será enviado",
    "privacy_text": (
        "Para gerar e verificar itens, trechos do seu material são enviados ao provedor "
        "escolhido (OpenRouter) e ao modelo selecionado. O arquivo inteiro nunca é enviado "
        "de uma vez e nada é enviado a servidores do MIND, que não existem."
    ),
    "accept": "Aceito",
    "consent_given": "Envio de trechos aceito.",
    "consent_missing": "Envio de trechos ainda não aceito.",
    "consent_revoke": "Revogar aceite",
    "spent_month": "Gasto no mês",
    "refresh_models": "Atualizar catálogo de modelos",
    "models_known": "Modelos conhecidos",
    "workspace_settings": "Configurações do workspace",
}
