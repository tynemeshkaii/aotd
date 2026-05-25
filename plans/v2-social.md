# V2 — Социальный слой (deferred backlog)

> **Дата создания:** 2026-05-25
> **Статус:** Отложено до v2 (major release после product-market fit v1).
> **Контекст решения:** На этапе бета-v1 социальные фичи страдают от cold-start (мало юзеров → пустой feed → выглядит как сломанная фича). Решено сначала довести solo-experience до отличного качества (алгоритм + дизайн + надёжность), валидировать через closed beta + App Store v1, и только потом возвращаться к социалке когда есть base юзеров и понимание реальных паттернов использования.

Этот документ — backlog идей и решений, которые НЕ выбрасываем, но НЕ делаем в v1. Когда стартует v2 — этот документ становится отправной точкой для планов фаз v2.

---

## 1. Почему вырезаем из v1

1. **Cold-start problem.** Friends-таб с 0–2 друзьями ухудшает впечатление о приложении ("пусто, не работает") вместо того чтобы добавлять value.
2. **Solo-value first.** Все успешные music-discovery продукты (Discover Weekly, Last.fm, AlbumOfTheYear) — solo-first. Социалка наслаивается *после* доказанной solo-ценности.
3. **Scope discipline.** Меньше surface area = больше внимания качеству алгоритма, дизайна и надёжности. Фаза 3 уже показала что combinatorial complexity (auth + sync + realtime) даёт каскад багов.
4. **Privacy и legal.** Социальные фичи требуют дополнительной работы над privacy controls, App Store нутри-метками, GDPR. В v1 проще: всё private, опт-инов нет.

## 2. Что НЕ создаём в v1 (но архитектура должна допускать)

### 2.1. DB-таблицы (создадим в v2-миграциях)

```sql
-- friendships
id, requester_id, addressee_id, status ('pending'|'accepted'|'blocked'), created_at

-- activity_feed
id, user_id, type ('rated'|'opened'|'shared'), payload jsonb, created_at, visibility

-- shared_lists (опционально, можно отложить ещё дальше)
id, owner_id, title, slug, created_at

-- shared_list_items
list_id, album_id, added_at, note
```

### 2.2. Колонки уже заложены в v1 схеме

- `ratings.is_public` — boolean. В v1 всегда false, в v2 юзер сможет включить opt-in (per-rating или global setting).
- В v1 ratings — **personal journal**, не алгоритмический сигнал. В v2 они становятся социальной валютой (feed, "loved by friends"). Алгоритмическое использование ratings (social signal в scoring) — отдельный open вопрос v2, требует A/B.
- `profiles.display_name` + `profiles.avatar_url` — уже есть, готовы к публичным профилям.

**Важно:** при добавлении v2-миграций НЕ менять опт-аут logic на opt-in retroactively. Все существующие v1-юзеры должны явно включить публичность, а не получить feed своих оценок без согласия.

### 2.3. Tab Bar

V1 финальная структура: `Home / Discoveries / Stats / Profile`. В v2 либо добавляем 5-й таб `Friends`, либо заменяем `Stats` на комбинированный `Stats + Social` экран. Решаем когда будем планировать v2.

## 3. Backlog фич для v2

### 3.1. Phase v2.1 — Friends graph (2 недели)

- Поиск пользователей:
  - По email (точное совпадение, требует opt-in у того, кого ищут)
  - По display_name (fuzzy, только публичные профили)
  - По Spotify display_name через `streaming_connections.provider_user_id` (опционально, для onboarding flow "find friends from Spotify")
- Friend request flow: send → notify → accept/reject/block
- `friendships` таблица + RLS
- Profile screen расширяется: список друзей, кнопка add friend на чужом профиле
- Block / unfriend

### 3.2. Phase v2.2 — Activity feed (2 недели)

- `activity_feed` таблица
- Friends-таб (или Social-таб): infinite scroll feed
- Типы событий: `rated_album`, `opened_album_of_the_day`, `shared_album`
- Фильтры: today / week / all
- Privacy controls: per-event (юзер выбирает что попадает в feed) или per-rating (`ratings.is_public`)
- Лайки / реакции на event'ы (опционально)

### 3.3. Phase v2.3 — Social signal в алгоритме (1 неделя)

- Расширить `compute-album-of-the-day` score:
  - +0.1 weight если N+ друзей оценили альбом ≥7
  - Учитывать только взаимные friendships (`status = 'accepted'`)
- `selection_reason` jsonb получает поле `friends_rated` для прозрачности на карточке
- A/B: с social signal vs без — мерить retention и quality

### 3.4. Phase v2.4 — Profile-by-username + публичные оценки (1.5 недели)

- Публичный URL профиля (если юзер включил public mode)
- Показ публичных оценок в profile другого юзера
- Карточка альбома показывает блок "Friends who rated this"
- App Store privacy nutrition labels обновить

### 3.5. Phase v2.5 — Shared lists (опционально, можно отложить в v3)

- "Создай свой список альбомов и поделись"
- Деплинк / share intent на список
- Импорт из списка в свои discoveries

## 4. Privacy и legal-чеклист для v2

- [ ] App Store privacy nutrition labels: добавить "Other Users' Content", "Contacts" (если ищем по email)
- [ ] GDPR data export: добавить export friendships, activity_feed
- [ ] GDPR data deletion: cascade на friendships и activity_feed
- [ ] Block flow: gracefully скрывать заблокированного от feed, поиска, recommendations
- [ ] Report user / report content
- [ ] Терms of service update — добавить раздел про публичный контент
- [ ] Default privacy: всё private, юзер opt-in'ит каждую публичную фичу

## 5. Метрики продукта для решения "стартуем v2 или нет"

После v1 release собираем:
- DAU/MAU > 30% (core retention достаточен)
- Day-30 retention > 15% (есть стабильная база)
- Среднее число rated альбомов / юзер / месяц ≥ 8 (есть что показывать в feed)
- ≥ 30% юзеров используют share intent (есть organic интерес делиться)
- Бета-юзеры/early adopters сами просят социалку в фидбеке

Если все 5 — стартуем v2. Если 2-3 — сначала улучшаем алгоритм/дизайн ещё одну итерацию.

## 6. Что НЕ делаем даже в v2 (вынесено за горизонт)

- DMs / чаты между юзерами — не наш продукт, есть Telegram/iMessage
- Группы / клубы по жанрам — слишком community-ориентировано, отдельный продукт
- Музыкальные блоги / длинные ревью — наша фишка короткие оценки, не Substack
- Скрейпинг внешних сервисов (RYM, AOTY) для социального графа — юридически опасно

---

## 7. Принципы дизайна v2 (заранее)

1. **Social — opt-in, не on-by-default.** Каждый юзер должен явно решить что и кому показывать.
2. **Feed — sparse, не infinite.** Лучше 3 качественных события друзей в день чем бесконечная лента — мы про музыку, не про doom-scrolling.
3. **Никаких vanity-метрик.** Нет лайков-счётчиков, followers count напоказ, "top reviewers" leaderboards. Это убивает атмосферу.
4. **Friends — не followers.** Двунаправленный граф, не one-way. Это удерживает уровень доверия.
5. **Профиль показывает вкус, не активность.** Топ-альбомы / любимые жанры / "currently exploring" вместо "8 hours ago opened X".
