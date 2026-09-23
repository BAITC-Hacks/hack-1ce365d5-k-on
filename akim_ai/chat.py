"""Terminal UI shared by real and clearly labelled demo providers."""
from .session import ChatSession


HELP = """Напишите вопрос обычным языком.
/priority ТЕКСТ — закрепить приоритет; /priority - — убрать его
/choose candidate_1 — принять предложенный набор
/show — показать приоритет, текущий набор и последние варианты
/ask ВОПРОС — только объяснение, без поиска новых вариантов
/new — очистить память этого диалога
/help — команды; /exit — сохранить и выйти
Предложения не меняют текущий набор, пока вы не выполните /choose.
"""


def show_decisions(decisions, catalog, simulation=None):
    measures = {m["id"]: m for m in catalog["measures"]}
    districts = {d["id"]: d["name"] for d in catalog["districts"]}
    if not decisions:
        print("  Меры пока не выбраны.")
    for decision in decisions:
        measure = measures[decision["measure_id"]]
        place = districts.get(decision["district_id"], "весь город")
        print(f"  {measure['id']}: {measure['name']} — {place}; стоимость {measure['cost']}, лаг {measure['lag']} кв.")
    if decisions:
        cost = sum(measures[d["measure_id"]]["cost"] for d in decisions)
        score = (f"Score: {simulation['score']}." if simulation is not None
                 else "Итоговый Score не рассчитан.")
        print(f"  Стоимость: {cost} из {catalog['rules']['budget']}. {score}")


def render_result(result, catalog):
    for message in result.get("errors", []) + result.get("warnings", []):
        print(f"  {message}")
    brief = result.get("briefing")
    if brief:
        print(f"\nСоветник: {brief['summary']['text']}")
        for key, label in (("strengths", "Плюс"), ("risks", "Ограничение")):
            for statement in brief[key]:
                print(f"  {label}: {statement['text']}")
        print(f"  Дальше: {brief['next_step']}")
    labels = {"unverified": "не проверен расчётом", "verified": "рассчитан движком",
              "invalid": "нарушает правила", "error": "проверка недоступна"}
    for candidate in result.get("candidates", []):
        print(f"\n{candidate['id']} ({labels[candidate['status']]}): {candidate['reason']}")
        show_decisions(candidate["decisions"], catalog, candidate["simulation"])
        for error in candidate["errors"]:
            print(f"  {error}")


def run_chat(advisor, path, provider):
    session = ChatSession.load(path)
    print("Советник акима. Память диалога:", path)
    if provider == "demo":
        print("ДЕМО: фиксированный ответ, настоящая модель не вызывается и вопросы не понимает.")
    else:
        print("OpenAI: сообщения и контекст отправляются выбранной модели при каждом вопросе.")
    print(HELP)
    print(f"В памяти: {len(session.conversation['history']) // 2} обменов сообщениями.")
    while True:
        try:
            message = input("\nВы: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            session.save(path)
            return 0
        if not message:
            continue
        try:
            command, _, argument = message.partition(" ")
            if command == "/exit":
                session.save(path)
                return 0
            if command == "/help":
                print(HELP)
                continue
            if command == "/new":
                session.reset()
                session.save(path)
                print("Память очищена. Начат новый диалог.")
                continue
            if command == "/priority":
                session.set_priority("" if argument == "-" else argument)
                session.save(path)
                print("Приоритет:", session.conversation["priority"] or "не задан")
                continue
            if command == "/choose":
                session.choose(argument.strip())
                session.save(path)
                print("Набор принят игроком. Его последствия ещё не рассчитаны.")
                continue
            if command == "/show":
                print("Приоритет:", session.conversation["priority"] or "не задан")
                print("Принятый набор:")
                show_decisions(session.decisions, advisor.catalog)
                for candidate in session.conversation["previous_candidates"]:
                    print(f"Предложение {candidate['id']}: {candidate['reason']}")
                    show_decisions(candidate["decisions"], advisor.catalog)
                continue
            if command.startswith("/") and command != "/ask":
                print("Неизвестная команда. Введите /help.")
                continue
            question = argument if command == "/ask" else message
            print("Советник готовит ответ…")
            result = session.ask(advisor, question, suggest=command != "/ask")
            render_result(result, advisor.catalog)
            session.save(path)
        except (ValueError, OSError) as exc:
            print(f"Ошибка: {exc}")
        except KeyboardInterrupt:
            print("Запрос прерван. Сохранённый диалог доступен при следующем запуске.")
            session.save(path)
            return 0
