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
}
