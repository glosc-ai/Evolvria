extends Node

signal ai_request_started(request_id: String, purpose: String)
signal ai_request_finished(request_id: String, result: Dictionary)
signal ai_request_failed(request_id: String, error: String)
signal ai_confirmation_requested(request_id: String, purpose: String, summary: String)

const MAX_RESPONSE_BYTES := 524288
const DEFAULT_GLOSC_MODEL := "deepseek/deepseek-v4-pro"

var _request_counter: int = 0
var pending_confirmation: Dictionary = {}
var _active_requests: Dictionary = {}

func estimate_usage(purpose: String, input: Dictionary = {}) -> Dictionary:
	var remote_enabled := SettingsStore.is_glosc_configured()
	var estimate := _estimate_tokens(purpose, input)
	var input_tokens := int(estimate.get("input_tokens", 0))
	var output_tokens := int(estimate.get("output_tokens", 0))
	var risk_reasons := _estimate_risk_reasons(purpose, input, remote_enabled)
	var risk_level := "中"
	if purpose == "world_expand":
		risk_level = "高"
	elif not remote_enabled and str(SettingsStore.get_value("log_level", "debug")) != "deep":
		risk_level = "低"
	return {
		"purpose": purpose,
		"purpose_label": _purpose_label(purpose),
		"remote_enabled": remote_enabled,
		"input_tokens": input_tokens,
		"output_tokens": output_tokens,
		"total_tokens": input_tokens + output_tokens,
		"cost_estimate": null,
		"billing_note": "将消耗 Glosc One 额度" if remote_enabled else "未配置 Glosc One：本地模拟不消耗远端额度",
		"risk_level": risk_level,
		"risk_reasons": risk_reasons,
		"retry_note": "失败时会按设置自动重试一次" if bool(SettingsStore.get_value("auto_retry", true)) else "失败时不会自动重试"
	}

func estimate_usage_text(estimate: Dictionary) -> String:
	if estimate.is_empty():
		return ""
	var reasons: Array[String] = []
	for item in estimate.get("risk_reasons", []):
		reasons.append(str(item))
	var reason_text := "；".join(reasons)
	if reason_text.is_empty():
		reason_text = "无额外风险提示"
	return "%s · 预计 Token %d（输入 %d / 输出 %d）· 风险 %s · %s · %s" % [
		estimate.get("purpose_label", estimate.get("purpose", "")),
		int(estimate.get("total_tokens", 0)),
		int(estimate.get("input_tokens", 0)),
		int(estimate.get("output_tokens", 0)),
		estimate.get("risk_level", "中"),
		estimate.get("billing_note", ""),
		reason_text
	]

func get_pending_confirmation_estimate() -> Dictionary:
	return pending_confirmation.get("estimate", {}) as Dictionary

func glosc_status_summary(status: Dictionary = {}) -> Dictionary:
	var endpoint := _resolve_glosc_endpoint()
	var configured := SettingsStore.is_glosc_configured() and not endpoint.is_empty()
	var total_tokens := 0
	if Engine.has_singleton("WorldStore"):
		var usage: Dictionary = WorldStore.get_ai_usage_summary()
		total_tokens = int(usage.get("total_tokens", 0))
	var quota_units := int(status.get("quota_units", SettingsStore.get_value("glosc_quota_units", 5000)))
	var used_units := int(status.get("used_units", total_tokens))
	var balance_units: Variant = status.get("balance_units", null)
	var percent := 0.0
	if quota_units > 0:
		percent = clampf(float(used_units) / float(quota_units), 0.0, 1.0)
	var label := "未配置，使用本地模拟"
	var detail := "填写服务地址和访问令牌后可测试连接；本地模拟不消耗 Glosc One 额度。"
	if configured:
		label = "已配置，尚未测试"
		detail = "下一次远端 AI 调用会使用此地址和令牌。"
	if not status.is_empty():
		if bool(status.get("ok", false)):
			label = "已连接"
			detail = str(status.get("message", "Glosc One 连接测试通过。"))
		else:
			label = "连接异常"
			detail = str(status.get("error", "Glosc One 连接测试失败。"))
	return {
		"configured": configured,
		"endpoint": endpoint,
		"label": label,
		"detail": detail,
		"used_units": used_units,
		"quota_units": quota_units,
		"percent": percent,
		"balance_units": balance_units,
		"checked_at": str(status.get("checked_at", ""))
	}

func check_glosc_connection() -> Dictionary:
	return await fetch_glosc_models(
		str(SettingsStore.get_value("glosc_base_url", "")),
		str(SettingsStore.get_value("glosc_token", "")),
		str(SettingsStore.get_value("model", DEFAULT_GLOSC_MODEL))
	)

func fetch_glosc_models(base_url: String, token: String, configured_model: String = "") -> Dictionary:
	var request_id := _next_request_id()
	var endpoint := _resolve_glosc_models_endpoint(base_url)
	if endpoint.is_empty():
		return _glosc_status_result(request_id, false, "Glosc One 服务地址无效。", {}, false)
	var access_token := token.strip_edges()
	if access_token.is_empty():
		return _glosc_status_result(request_id, false, "Glosc One 访问令牌为空。", {}, false)
	var headers := [
		"Accept: application/json",
		"Authorization: Bearer %s" % access_token
	]
	var response := await _http_client_request(HTTPClient.METHOD_GET, endpoint, headers)
	if str(response.get("status", "")) != "ok":
		return _glosc_status_result(request_id, false, str(response.get("error", "Glosc One 网络请求失败。")), {}, bool(response.get("retryable", true)))
	var status_code := int(response.get("http_status", 0))
	var body := response.get("body", PackedByteArray()) as PackedByteArray
	if status_code >= 200 and status_code < 300:
		var parsed: Dictionary = parse_status_body(body)
		var models := parse_models_body(body, configured_model)
		if models.is_empty():
			return _glosc_status_result(request_id, false, "Glosc One 连接测试未返回合法模型列表，请确认服务地址是否为 API 地址。", {}, false)
		for key in models.keys():
			parsed[key] = models[key]
		return _glosc_status_result(request_id, true, "Glosc One 连接测试通过。", parsed, false)
	return _glosc_status_result(request_id, false, _http_error_message(status_code), {"http_status": status_code}, _is_retryable_status(status_code))

func parse_status_body(body: PackedByteArray) -> Dictionary:
	if body.is_empty():
		return {}
	var data := _parse_json_dictionary_from_body(body)
	if data.is_empty():
		return {}
	var usage: Dictionary = data.get("usage", {}) if data.get("usage", {}) is Dictionary else {}
	var billing: Dictionary = data.get("billing", {}) if data.get("billing", {}) is Dictionary else {}
	var source: Dictionary = data.duplicate(true)
	for key in usage.keys():
		source[key] = usage[key]
	for key in billing.keys():
		source[key] = billing[key]
	var result: Dictionary = {}
	var used_units: Variant = _extract_numeric(source, ["used_units", "used", "tokens_used", "total_tokens"])
	if used_units != null:
		result["used_units"] = int(ceil(float(used_units)))
	var quota_units: Variant = _extract_numeric(source, ["quota_units", "quota", "limit", "monthly_quota"])
	if quota_units != null:
		result["quota_units"] = int(ceil(float(quota_units)))
	var balance_units: Variant = _extract_numeric(source, ["balance_units", "balance", "remaining", "credits"])
	if balance_units != null:
		result["balance_units"] = int(ceil(float(balance_units)))
	if source.has("currency"):
		result["currency"] = str(source.get("currency", ""))
	return result

func parse_models_body(body: PackedByteArray, configured_model: String = "") -> Dictionary:
	if body.is_empty():
		return {}
	var data := _parse_json_dictionary_from_body(body)
	if data.is_empty():
		return {}
	var models: Variant = data.get("data", [])
	if not models is Array:
		return {}
	var model_ids: Array[String] = []
	for item in models:
		if not item is Dictionary:
			continue
		var model := item as Dictionary
		var model_id := str(model.get("id", "")).strip_edges()
		if model_id.is_empty():
			continue
		model_ids.append(model_id)
	if model_ids.is_empty():
		return {}
	var active_model := configured_model.strip_edges()
	if active_model.is_empty():
		active_model = str(SettingsStore.get_value("model", DEFAULT_GLOSC_MODEL))
	return {
		"model_count": model_ids.size(),
		"configured_model_available": active_model in model_ids,
		"model_ids": model_ids,
		"sample_models": model_ids.slice(0, mini(8, model_ids.size()))
	}

func _parse_json_dictionary_from_body(body: PackedByteArray) -> Dictionary:
	var parser := JSON.new()
	if parser.parse(body.get_string_from_utf8()) != OK:
		return {}
	return parser.data as Dictionary if parser.data is Dictionary else {}

func _next_request_id() -> String:
	_request_counter += 1
	return "ai_req_%04d" % _request_counter

func generate_world(seed: Dictionary) -> Dictionary:
	var request_id := _next_request_id()
	var estimate := estimate_usage("world_expand", {"seed": seed})
	if not await _confirm_if_needed(request_id, "world_expand", "生成完整世界观、地点、关键角色补全和开局事件。", estimate):
		return _cancelled_result(request_id, "world_expand")
	ai_request_started.emit(request_id, "world_expand")
	if SettingsStore.is_glosc_configured():
		var remote_result := await _call_glosc(request_id, "world_expand", {"seed": seed})
		if str(remote_result.get("status", "error")) == "ok":
			ai_request_finished.emit(request_id, remote_result)
		else:
			ai_request_failed.emit(request_id, str(remote_result.get("error", "Glosc One 调用失败。")))
		return remote_result
	await get_tree().create_timer(0.35).timeout

	var genre := str(seed.get("genre", "奇幻"))
	var world_name := str(seed.get("world_name", "未命名世界"))
	var hero := seed.get("hero", {}) as Dictionary
	var hero_name := str(hero.get("name", "旅人"))
	var start_location := "%s边境驿站" % world_name.substr(0, mini(2, world_name.length()))

	var result := {
		"request_id": request_id,
		"status": "ok",
		"summary": "%s 是一个%s叙事世界。旧秩序正在松动，边境传闻、失落遗迹与私人誓言交织成新的时代。" % [world_name, genre],
		"rules": [
			"玩家明确设定优先于后续生成内容。",
			"重要事件会写入时间线，并影响角色记忆。",
			"关键角色会在时间推进时自主行动。"
		],
		"themes": [genre, str(seed.get("tone", "冒险")), "长期记忆"],
		"locations": [
			{"id": "loc_start", "name": start_location, "type": "town", "description": "商队、流民和消息贩子汇集的边境落脚点。", "position": {"x": 0.42, "y": 0.58}, "state_tags": ["safe", "market"]},
			{"id": "loc_archive", "name": "灰烬档案馆", "type": "ruin", "description": "被封存的旧时代档案深埋在焦黑石柱之间。", "position": {"x": 0.68, "y": 0.34}, "state_tags": ["mystery", "danger"]},
			{"id": "loc_forest", "name": "回声林", "type": "forest", "description": "林中道路会记住经过者的声音。", "position": {"x": 0.25, "y": 0.38}, "state_tags": ["wild", "rumor"]},
			{"id": "loc_citadel", "name": "白塔城", "type": "city", "description": "掌权者与预言家在高塔阴影下交换筹码。", "position": {"x": 0.72, "y": 0.70}, "state_tags": ["political", "fortified"]}
		],
		"opening_event": {
			"title": "边境第一夜",
			"description": "%s 抵达%s时，驿站灯火忽明忽暗。有人认出了关键角色留下的徽记，也有人声称灰烬档案馆在今夜重新开门。" % [hero_name, start_location],
			"suggested_actions": ["询问徽记的来源", "查看驿站公告", "寻找同行角色", "前往回声林边缘"]
		},
		"usage": {"input_tokens": 320, "output_tokens": 680, "cost": null}
	}

	ai_request_finished.emit(request_id, result)
	return result

func resolve_player_action(action: String, snapshot: Dictionary) -> Dictionary:
	var request_id := _next_request_id()
	var estimate := estimate_usage("player_action", {"action": action, "context": snapshot.get("ai_context", {})})
	if not await _confirm_if_needed(request_id, "player_action", "处理玩家行动：%s" % action.left(40), estimate):
		return _cancelled_result(request_id, "player_action")
	ai_request_started.emit(request_id, "player_action")
	if SettingsStore.is_glosc_configured():
		var remote_result := await _call_glosc(request_id, "player_action", {
			"action": action,
			"context": snapshot.get("ai_context", {})
		})
		if str(remote_result.get("status", "error")) == "ok":
			ai_request_finished.emit(request_id, remote_result)
		else:
			ai_request_failed.emit(request_id, str(remote_result.get("error", "Glosc One 调用失败。")))
		return remote_result
	await get_tree().create_timer(0.45).timeout

	var location := snapshot.get("current_location", {}) as Dictionary
	var ai_context := snapshot.get("ai_context", {}) as Dictionary
	var relevant_memories: Array = ai_context.get("relevant_memories", [])
	var location_name := str(location.get("name", "未知地点"))
	var lowered := action.to_lower()
	var outcome := "partial"
	var tone := "你采取行动后，局势出现了新的线索。"
	var outcome_reason := "行动有推进，但仍需要更多信息确认局势。"
	var outcome_consequence := "新增线索被写入时间线，附近角色会重新评估你的意图。"
	if lowered.contains("调查") or lowered.contains("查看") or lowered.contains("询问"):
		outcome = "success"
		tone = "你的谨慎带来回报，几个零散细节被串联起来。"
		outcome_reason = "行动方式与当前场景匹配，且风险可控。"
		outcome_consequence = "你获得可靠线索，并改善了后续选择。"
	elif lowered.contains("攻击") or lowered.contains("强行") or lowered.contains("威胁"):
		outcome = "cost"
		tone = "行动产生了效果，但也让旁观者记住了你的做法。"
		outcome_reason = "行动足够直接，但会提升紧张度。"
		outcome_consequence = "目标有所推进，同时地点状态和人际关系留下负面余波。"
	elif lowered.contains("等待") or lowered.contains("休息"):
		outcome = "quiet"
		tone = "时间流过，世界并没有停下脚步。"
		outcome_reason = "行动消耗时间而非主动改变局势。"
		outcome_consequence = "世界事件继续推进，你获得短暂观察窗口。"
	elif _looks_impossible_action(lowered):
		outcome = "blocked"
		tone = "这个行动超出了当前角色能力或场景条件，无法直接完成。"
		outcome_reason = "缺少必要条件、工具或可到达路径。"
		outcome_consequence = "行动受阻，但你可以改为寻找资源、询问线索或选择可执行的下一步。"

	var memory_hint := ""
	if not relevant_memories.is_empty():
		var memory := relevant_memories[0] as Dictionary
		memory_hint = "\n\n这次行动也触动了一条旧记忆：%s" % str(memory.get("text", "")).left(80)
	var narrative := "%s\n\n在%s，%s 这件事被记录为一次%s结果。附近的角色开始重新评估你的意图，新的选择也随之浮现。%s" % [action, location_name, tone, outcome, memory_hint]
	var result := {
		"request_id": request_id,
		"status": "ok",
		"narrative": narrative,
		"time_delta_hours": 1,
		"event_title": "行动：%s" % action.left(16),
		"event_type": "player_action",
		"outcome": outcome,
		"outcome_reason": outcome_reason,
		"consequence": outcome_consequence,
		"importance": 0.65,
		"suggested_actions": _suggest_actions_for(action, location_name),
		"memory_text": "玩家在%s选择：%s" % [location_name, action],
		"patches": [
			{
				"target_type": "location",
				"target_id": str(location.get("id", "loc_start")),
				"op": "append",
				"path": "state_tags",
				"value": outcome,
				"reason": "玩家行动在地点状态上留下可检索标签"
			}
		],
		"usage": {"input_tokens": 220 + relevant_memories.size() * 32, "output_tokens": 260, "cost": null}
	}
	ai_request_finished.emit(request_id, result)
	return result

func _looks_impossible_action(lowered_action: String) -> bool:
	for marker in ["飞到月亮", "毁灭世界", "瞬间传送", "复活所有", "无敌", "直接通关", "teleport", "moon", "god mode"]:
		if lowered_action.contains(marker):
			return true
	return false

func create_npc_event(character: Dictionary, snapshot: Dictionary) -> Dictionary:
	if SettingsStore.is_glosc_configured():
		var request_id := _next_request_id()
		var estimate := estimate_usage("npc_simulation", {"character": character, "context": snapshot.get("ai_context", {})})
		if not await _confirm_if_needed(request_id, "npc_simulation", "推进 NPC 自主行动：%s" % character.get("name", "未知角色"), estimate):
			return _cancelled_result(request_id, "npc_simulation")
		ai_request_started.emit(request_id, "npc_simulation")
		var remote_result := await _call_glosc(request_id, "npc_simulation", {
			"character": character,
			"context": snapshot.get("ai_context", {})
		})
		if str(remote_result.get("status", "error")) == "ok":
			ai_request_finished.emit(request_id, remote_result)
		else:
			ai_request_failed.emit(request_id, str(remote_result.get("error", "Glosc One 调用失败。")))
		return remote_result
	var locations: Array = snapshot.get("locations", [])
	if locations.is_empty():
		return {}
	var current_id := str(character.get("current_location_id", "loc_start"))
	var target := locations[randi() % locations.size()] as Dictionary
	var target_id := str(target.get("id", current_id))
	var character_name := str(character.get("name", "某人"))
	var verb := "追查传闻"
	var tendency := str(character.get("action_tendency", "")).strip_edges()
	var tendency_lower := tendency.to_lower()
	if tendency_lower.contains("情报") or tendency_lower.contains("观察") or tendency_lower.contains("调查"):
		verb = "收集情报"
	elif tendency_lower.contains("封锁") or tendency_lower.contains("扩张") or tendency_lower.contains("招募"):
		verb = "推进计划"
	elif str(character.get("role", "")).contains("敌") or str(character.get("relationship", "")).contains("敌"):
		verb = "布置试探"
	elif str(character.get("traits", [])).contains("谨慎"):
		verb = "收集情报"
	var motive := tendency if not tendency.is_empty() else "按照自己的目标寻找机会"

	return {
		"type": "npc_action",
		"title": "%s%s" % [character_name, verb],
		"description": "%s离开原本的位置，前往%s%s。行动倾向：%s。这个变化暂时只留下简短记录。" % [character_name, str(target.get("name", "某地")), verb, motive],
		"character_id": str(character.get("id", "")),
		"new_location_id": target_id,
		"importance": 0.35,
		"status": "ok",
		"usage": {"input_tokens": 90, "output_tokens": 80, "cost": null}
	}

func check_consistency(snapshot: Dictionary) -> Dictionary:
	var request_id := _next_request_id()
	var estimate := estimate_usage("consistency_check", snapshot)
	if not await _confirm_if_needed(request_id, "consistency_check", "检查世界引用、时间线顺序、记忆和线索一致性。", estimate):
		return _cancelled_result(request_id, "consistency_check")
	ai_request_started.emit(request_id, "consistency_check")
	if SettingsStore.is_glosc_configured():
		var remote_result := await _call_glosc(request_id, "consistency_check", snapshot)
		if str(remote_result.get("status", "error")) == "ok":
			ai_request_finished.emit(request_id, remote_result)
		else:
			ai_request_failed.emit(request_id, str(remote_result.get("error", "Glosc One 调用失败。")))
		return remote_result
	await get_tree().create_timer(0.15).timeout
	var issues: Array = snapshot.get("issues", [])
	var contradictions: Array[Dictionary] = []
	for issue in issues:
		var data := issue as Dictionary
		contradictions.append({
			"code": str(data.get("code", "consistency_issue")),
			"subject_id": str(data.get("subject_id", "")),
			"message": str(data.get("message", "")),
			"severity": "warning"
		})
	var result := {
		"request_id": request_id,
		"status": "ok",
		"facts": [],
		"memories": [],
		"unresolved_threads": [],
		"contradictions": contradictions,
		"warnings": ["发现 %d 个一致性问题。" % contradictions.size()] if not contradictions.is_empty() else ["世界一致性检查通过。"],
		"usage": {"input_tokens": int(estimate.get("input_tokens", 0)), "output_tokens": 80, "cost": null}
	}
	ai_request_finished.emit(request_id, result)
	return result

func extract_memory(snapshot: Dictionary) -> Dictionary:
	var request_id := _next_request_id()
	var estimate := estimate_usage("memory_extract", snapshot)
	if not await _confirm_if_needed(request_id, "memory_extract", "从既有事件抽取事实、记忆和未解决线索。", estimate):
		return _cancelled_result(request_id, "memory_extract")
	ai_request_started.emit(request_id, "memory_extract")
	if SettingsStore.is_glosc_configured():
		var remote_result := await _call_glosc(request_id, "memory_extract", snapshot)
		if str(remote_result.get("status", "error")) == "ok":
			ai_request_finished.emit(request_id, remote_result)
		else:
			ai_request_failed.emit(request_id, str(remote_result.get("error", "Glosc One 调用失败。")))
		return remote_result
	await get_tree().create_timer(0.12).timeout
	var event := snapshot.get("event", {}) as Dictionary
	var title := str(event.get("title", "未命名事件"))
	var description := str(event.get("description", ""))
	var event_id := str(event.get("id", ""))
	var location_id := str(event.get("location_id", ""))
	var facts: Array[String] = []
	if not title.is_empty():
		facts.append("事件：%s" % title)
	if not location_id.is_empty():
		facts.append("地点引用：%s" % location_id)
	for participant_id in event.get("participant_ids", []):
		facts.append("参与者：%s" % participant_id)
	var memories: Array[Dictionary] = [{
		"scope": "world",
		"owner_id": str(snapshot.get("world_id", "")),
		"text": ("%s：%s" % [title, description]).left(220),
		"event_id": event_id,
		"importance": clampf(float(event.get("importance", 0.45)), 0.2, 0.9),
		"confidence": 1.0,
		"facts": facts,
		"tags": ["memory_extract", str(event.get("type", "event"))]
	}]
	for participant_id in event.get("participant_ids", []):
		memories.append({
			"scope": "character",
			"owner_id": str(participant_id),
			"text": ("%s 参与了事件：%s" % [participant_id, title]).left(180),
			"event_id": event_id,
			"importance": clampf(float(event.get("importance", 0.45)), 0.2, 0.85),
			"confidence": 0.92,
			"facts": facts,
			"tags": ["memory_extract", "participant"]
		})
	var unresolved_threads: Array[Dictionary] = []
	var lower_text := ("%s %s" % [title, description]).to_lower()
	if lower_text.contains("线索") or lower_text.contains("秘密") or lower_text.contains("徽记") or lower_text.contains("目标"):
		unresolved_threads.append({
			"title": title.left(32),
			"description": description.left(180),
			"event_id": event_id,
			"tags": ["memory_extract", "unresolved"]
		})
	var result := {
		"request_id": request_id,
		"status": "ok",
		"facts": facts,
		"memories": memories,
		"unresolved_threads": unresolved_threads,
		"contradictions": [],
		"usage": {"input_tokens": int(estimate.get("input_tokens", 0)), "output_tokens": 110, "cost": null}
	}
	ai_request_finished.emit(request_id, result)
	return result

func update_summary(snapshot: Dictionary) -> Dictionary:
	var request_id := _next_request_id()
	var estimate := estimate_usage("summary_update", snapshot)
	if not await _confirm_if_needed(request_id, "summary_update", "压缩当前阶段事件，更新世界、角色和地点摘要。", estimate):
		return _cancelled_result(request_id, "summary_update")
	ai_request_started.emit(request_id, "summary_update")
	if SettingsStore.is_glosc_configured():
		var remote_result := await _call_glosc(request_id, "summary_update", snapshot)
		if str(remote_result.get("status", "error")) == "ok":
			ai_request_finished.emit(request_id, remote_result)
		else:
			ai_request_failed.emit(request_id, str(remote_result.get("error", "Glosc One 调用失败。")))
		return remote_result
	await get_tree().create_timer(0.16).timeout
	var draft := snapshot.get("draft_summary", {}) as Dictionary
	var event_count := int(snapshot.get("event_count", draft.get("event_count", 0)))
	var result := {
		"request_id": request_id,
		"status": "ok",
		"world_phase_summary": str(draft.get("text", "阶段摘要：整理了 %d 条事件。" % event_count)),
		"character_summaries": snapshot.get("character_summary_hints", []),
		"location_summaries": snapshot.get("location_summary_hints", []),
		"unresolved_threads": draft.get("unresolved_threads", []),
		"consistency_constraints": [
			"摘要只能概括 event_ids 中已发生的事件，不引入新事实。",
			"玩家明确设定、地点描述和已确认关系不得被摘要覆盖。"
		],
		"usage": {"input_tokens": int(estimate.get("input_tokens", 0)), "output_tokens": 180, "cost": null}
	}
	ai_request_finished.emit(request_id, result)
	return result

func _suggest_actions_for(action: String, location_name: String) -> Array[String]:
	if action.contains("地图") or action.contains("前往"):
		return ["确认路线风险", "召集同行者", "标记新的地点", "返回%s" % location_name]
	if action.contains("询问") or action.contains("交谈"):
		return ["追问细节", "观察对方反应", "交换一个承诺", "结束谈话"]
	return ["继续调查", "和最近的角色交谈", "推进一小时", "查看地图"]

func has_pending_confirmation() -> bool:
	return not pending_confirmation.is_empty()

func has_active_request() -> bool:
	return not _active_requests.is_empty()

func cancel_active_requests() -> void:
	for request_id in _active_requests.keys():
		cancel_request(str(request_id))

func cancel_request(request_id: String) -> void:
	if not _active_requests.has(request_id):
		return
	var data := _active_requests[request_id] as Dictionary
	data["cancelled"] = true
	var client: HTTPClient = data.get("client", null)
	if client != null:
		client.close()
	_active_requests[request_id] = data

func confirm_pending_request() -> void:
	if pending_confirmation.is_empty():
		return
	pending_confirmation["confirmed"] = true

func cancel_pending_request() -> void:
	if pending_confirmation.is_empty():
		return
	pending_confirmation["cancelled"] = true

func _confirm_if_needed(request_id: String, purpose: String, summary: String, estimate: Dictionary = {}) -> bool:
	if not bool(SettingsStore.get_value("confirm_ai_calls", true)):
		return true
	pending_confirmation = {
		"request_id": request_id,
		"purpose": purpose,
		"summary": summary,
		"estimate": estimate.duplicate(true),
		"confirmed": false,
		"cancelled": false
	}
	ai_confirmation_requested.emit(request_id, purpose, summary)
	while not bool(pending_confirmation.get("confirmed", false)) and not bool(pending_confirmation.get("cancelled", false)):
		await get_tree().process_frame
	var confirmed := bool(pending_confirmation.get("confirmed", false))
	pending_confirmation.clear()
	return confirmed

func _cancelled_result(request_id: String, purpose: String) -> Dictionary:
	var result := {"request_id": request_id, "status": "cancelled", "error": "AI 调用已取消。", "purpose": purpose}
	ai_request_failed.emit(request_id, "AI 调用已取消。")
	return result

func _call_glosc(request_id: String, purpose: String, input: Dictionary) -> Dictionary:
	var payload := {
		"request_id": request_id,
		"purpose": purpose,
		"model": str(SettingsStore.get_value("model", DEFAULT_GLOSC_MODEL)),
		"messages": _build_messages(purpose, input),
		"response_format": {"type": "json_object"},
		"metadata": {
			"world_id": AppState.current_world_id,
			"schema_version": 1
		}
	}
	var max_attempts := 2 if bool(SettingsStore.get_value("auto_retry", true)) else 1
	var last_result: Dictionary = {}
	for attempt in range(max_attempts):
		var result := await _call_glosc_once(request_id, purpose, payload, attempt + 1)
		last_result = result
		if str(result.get("status", "error")) == "ok":
			return result
		if str(result.get("status", "")) == "cancelled":
			return result
		if attempt < max_attempts - 1 and _should_retry(result):
			await get_tree().create_timer(0.75 + float(attempt) * 0.5).timeout
			continue
		return result
	return last_result

func _call_glosc_once(request_id: String, purpose: String, payload: Dictionary, attempt: int) -> Dictionary:
	var headers := [
		"Content-Type: application/json",
		"Authorization: Bearer %s" % str(SettingsStore.get_value("glosc_token", ""))
	]
	var endpoint := _resolve_glosc_chat_endpoint()
	if endpoint.is_empty():
		return {"request_id": request_id, "status": "error", "error": "Glosc One 服务地址为空。", "retryable": false}
	var response := await _http_client_request(HTTPClient.METHOD_POST, endpoint, headers, JSON.stringify(payload), request_id, purpose, attempt)
	if str(response.get("status", "")) == "cancelled":
		return {"request_id": request_id, "status": "cancelled", "error": "AI 调用已取消。", "purpose": purpose, "retryable": false}
	if str(response.get("status", "")) != "ok":
		return {"request_id": request_id, "status": "error", "error": str(response.get("error", "Glosc One 网络请求失败。")), "retryable": bool(response.get("retryable", true))}
	var status_code := int(response.get("http_status", 0))
	var body := response.get("body", PackedByteArray()) as PackedByteArray
	if status_code < 200 or status_code >= 300:
		return {"request_id": request_id, "status": "error", "error": _http_error_message(status_code), "http_status": status_code, "retryable": _is_retryable_status(status_code)}
	return parse_response_body(body, request_id, purpose, attempt)

func _http_client_request(method: int, endpoint: String, headers: Array, request_body: String = "", request_id: String = "", purpose: String = "", attempt: int = 1) -> Dictionary:
	var parts := _split_http_url(endpoint)
	if parts.is_empty():
		return {"status": "error", "error": "Glosc One 服务地址无效。", "retryable": false}
	var client := HTTPClient.new()
	if not request_id.is_empty():
		_active_requests[request_id] = {"client": client, "cancelled": false, "purpose": purpose, "attempt": attempt}
	var err := client.connect_to_host(str(parts.get("host", "")))
	if err != OK:
		if not request_id.is_empty():
			_active_requests.erase(request_id)
		return {"status": "error", "error": "无法连接 Glosc One：%s" % error_string(err), "retryable": true}
	var deadline_msec := _request_deadline_msec()
	while client.get_status() in [HTTPClient.STATUS_RESOLVING, HTTPClient.STATUS_CONNECTING]:
		if _http_request_should_stop(client, request_id, deadline_msec):
			return _http_request_stopped_result(request_id)
		client.poll()
		await get_tree().process_frame
	if client.get_status() != HTTPClient.STATUS_CONNECTED:
		var message := _connection_status_message(client.get_status())
		client.close()
		if not request_id.is_empty():
			_active_requests.erase(request_id)
		return {"status": "error", "error": "Glosc One 网络请求失败：%s" % message, "retryable": true}
	err = client.request(method, str(parts.get("path", "/")), headers, request_body)
	if err != OK:
		client.close()
		if not request_id.is_empty():
			_active_requests.erase(request_id)
		return {"status": "error", "error": "无法发起 Glosc One 请求：%s" % error_string(err), "retryable": true}
	while client.get_status() == HTTPClient.STATUS_REQUESTING:
		if _http_request_should_stop(client, request_id, deadline_msec):
			return _http_request_stopped_result(request_id)
		client.poll()
		await get_tree().process_frame
	var status_code := client.get_response_code()
	var body := PackedByteArray()
	while client.get_status() == HTTPClient.STATUS_BODY:
		if _http_request_should_stop(client, request_id, deadline_msec):
			return _http_request_stopped_result(request_id)
		client.poll()
		var chunk := client.read_response_body_chunk()
		if not chunk.is_empty():
			body.append_array(chunk)
			if body.size() > MAX_RESPONSE_BYTES:
				client.close()
				if not request_id.is_empty():
					_active_requests.erase(request_id)
				return {"status": "error", "error": "Glosc One 响应超过客户端限制。", "retryable": false}
		await get_tree().process_frame
	client.close()
	if not request_id.is_empty():
		_active_requests.erase(request_id)
	return {"status": "ok", "http_status": status_code, "body": body}

func _http_request_should_stop(client: HTTPClient, request_id: String, deadline_msec: int) -> bool:
	if not request_id.is_empty() and _is_request_cancelled(request_id):
		client.close()
		return true
	if Time.get_ticks_msec() >= deadline_msec:
		client.close()
		if not request_id.is_empty() and _active_requests.has(request_id):
			var data := _active_requests[request_id] as Dictionary
			data["timed_out"] = true
			_active_requests[request_id] = data
		return true
	return false

func _http_request_stopped_result(request_id: String) -> Dictionary:
	var timed_out := true
	if not request_id.is_empty() and _active_requests.has(request_id):
		var data := _active_requests[request_id] as Dictionary
		timed_out = bool(data.get("timed_out", false))
		_active_requests.erase(request_id)
	if timed_out:
		return {"status": "error", "error": "Glosc One 请求超时。", "retryable": true}
	return {"status": "cancelled", "error": "AI 调用已取消。", "retryable": false}

func _split_http_url(url: String) -> Dictionary:
	var trimmed := url.strip_edges()
	var scheme_index := trimmed.find("://")
	if scheme_index == -1:
		return {}
	var scheme := trimmed.left(scheme_index)
	if not scheme in ["http", "https"]:
		return {}
	var rest := trimmed.substr(scheme_index + 3)
	if rest.strip_edges().is_empty() or rest.begins_with("/"):
		return {}
	var slash_index := rest.find("/")
	var host_and_port := rest if slash_index == -1 else rest.left(slash_index)
	if host_and_port.strip_edges().is_empty():
		return {}
	var path := "/" if slash_index == -1 else rest.substr(slash_index)
	return {"host": "%s://%s" % [scheme, host_and_port], "path": path}

func _connection_status_message(status: int) -> String:
	match status:
		HTTPClient.STATUS_CANT_RESOLVE:
			return "无法解析服务地址"
		HTTPClient.STATUS_CANT_CONNECT:
			return "无法连接服务"
		HTTPClient.STATUS_CONNECTION_ERROR:
			return "连接中断"
		HTTPClient.STATUS_TLS_HANDSHAKE_ERROR:
			return "TLS 握手失败"
		_:
			return str(status)

func parse_response_body(body: PackedByteArray, request_id: String, purpose: String, attempt: int = 1) -> Dictionary:
	if body.size() > MAX_RESPONSE_BYTES:
		return {
			"request_id": request_id,
			"purpose": purpose,
			"status": "error",
			"error": "Glosc One 响应超过客户端限制。",
			"retryable": false,
			"attempt": attempt
		}
	var parser := JSON.new()
	var parse_error := parser.parse(body.get_string_from_utf8())
	if parse_error != OK or not parser.data is Dictionary:
		return {
			"request_id": request_id,
			"purpose": purpose,
			"status": "error",
			"error": "Glosc One 响应不是合法 JSON。",
			"retryable": false,
			"attempt": attempt
		}
	var data := parser.data as Dictionary
	if data.has("choices") and data.get("choices") is Array:
		return _parse_openai_chat_response(data, request_id, purpose, attempt)
	if data.has("content") and data.get("content") is Dictionary:
		var content := data.get("content") as Dictionary
		content["request_id"] = str(data.get("request_id", request_id))
		content["status"] = str(data.get("status", content.get("status", "ok")))
		content["usage"] = _normalize_usage(data.get("usage", content.get("usage", {})))
		content["purpose"] = str(content.get("purpose", purpose))
		content["attempt"] = attempt
		return content
	data["request_id"] = str(data.get("request_id", request_id))
	data["status"] = str(data.get("status", "ok"))
	data["purpose"] = str(data.get("purpose", purpose))
	data["attempt"] = attempt
	data["usage"] = _normalize_usage(data.get("usage", {}))
	return data

func _resolve_glosc_endpoint() -> String:
	return _resolve_glosc_api_root()

func _resolve_glosc_models_endpoint(base_url: String = "") -> String:
	var root := _resolve_glosc_api_root(base_url)
	return "" if root.is_empty() else "%s/models" % root

func _resolve_glosc_chat_endpoint() -> String:
	var root := _resolve_glosc_api_root()
	return "" if root.is_empty() else "%s/chat/completions" % root

func _resolve_glosc_api_root(base_url: String = "") -> String:
	var endpoint := base_url.strip_edges()
	if endpoint.is_empty():
		endpoint = str(SettingsStore.get_value("glosc_base_url", "")).strip_edges()
	if endpoint.is_empty():
		return ""
	if not endpoint.begins_with("http://") and not endpoint.begins_with("https://"):
		endpoint = "https://%s" % endpoint
	var scheme_index := endpoint.find("://")
	if scheme_index == -1:
		return ""
	var host_and_path := endpoint.substr(scheme_index + 3)
	if host_and_path.strip_edges().is_empty() or host_and_path.begins_with("/"):
		return ""
	while endpoint.ends_with("/") and endpoint.length() > scheme_index + 3:
		endpoint = endpoint.left(endpoint.length() - 1)
	if endpoint.ends_with("/chat/completions"):
		endpoint = endpoint.trim_suffix("/chat/completions")
	if endpoint.ends_with("/models"):
		endpoint = endpoint.trim_suffix("/models")
	if not endpoint.ends_with("/v1"):
		endpoint = "%s/v1" % endpoint
	return endpoint

func _parse_openai_chat_response(data: Dictionary, request_id: String, purpose: String, attempt: int) -> Dictionary:
	var choices := data.get("choices", []) as Array
	if choices.is_empty() or not choices[0] is Dictionary:
		return {
			"request_id": request_id,
			"purpose": purpose,
			"status": "error",
			"error": "Glosc One 响应缺少 choices。",
			"retryable": false,
			"attempt": attempt
		}
	var choice := choices[0] as Dictionary
	var message: Variant = choice.get("message", {})
	if not message is Dictionary:
		return {
			"request_id": request_id,
			"purpose": purpose,
			"status": "error",
			"error": "Glosc One 响应缺少 message。",
			"retryable": false,
			"attempt": attempt
		}
	var content_text := str((message as Dictionary).get("content", "")).strip_edges()
	var parsed_content: Variant = JSON.parse_string(content_text)
	if not parsed_content is Dictionary:
		return {
			"request_id": request_id,
			"purpose": purpose,
			"status": "error",
			"error": "Glosc One 响应内容不是合法 JSON。",
			"retryable": false,
			"attempt": attempt
		}
	var content := parsed_content as Dictionary
	if content.has("content") and content.get("content") is Dictionary:
		var nested := content.get("content") as Dictionary
		for key in content.keys():
			if key == "content":
				continue
			if not nested.has(key):
				nested[key] = content[key]
		content = nested
	content["request_id"] = str(data.get("request_id", request_id))
	content["status"] = str(content.get("status", "ok"))
	content["usage"] = _normalize_usage(data.get("usage", content.get("usage", {})))
	content["purpose"] = str(content.get("purpose", purpose))
	content["attempt"] = attempt
	return content

func _normalize_usage(raw_usage: Variant) -> Dictionary:
	if not raw_usage is Dictionary:
		return {"input_tokens": 0, "output_tokens": 0, "cost": null}
	var usage := raw_usage as Dictionary
	return {
		"input_tokens": int(usage.get("input_tokens", usage.get("prompt_tokens", 0))),
		"output_tokens": int(usage.get("output_tokens", usage.get("completion_tokens", 0))),
		"cost": usage.get("cost", usage.get("cost_estimate", null))
	}

func _request_deadline_msec() -> int:
	var timeout_seconds := maxf(1.0, float(SettingsStore.get_value("timeout_seconds", 45)))
	return Time.get_ticks_msec() + int(ceil(timeout_seconds * 1000.0))

func _is_request_cancelled(request_id: String) -> bool:
	if not _active_requests.has(request_id):
		return false
	var data := _active_requests[request_id] as Dictionary
	return bool(data.get("cancelled", false))

func _should_retry(result: Dictionary) -> bool:
	return bool(result.get("retryable", false))

func _is_retryable_status(status_code: int) -> bool:
	return status_code == 408 or status_code == 409 or status_code == 425 or status_code == 429 or status_code >= 500

func _http_error_message(status_code: int) -> String:
	match status_code:
		401, 403:
			return "Glosc One 认证失败，请检查访问令牌。"
		402:
			return "Glosc One 余额不足或账户无法计费。"
		408:
			return "Glosc One 请求超时。"
		429:
			return "Glosc One 请求被限流，请稍后重试。"
		451:
			return "Glosc One 内容安全拦截。"
		_:
			if status_code >= 500:
				return "Glosc One 服务端错误：HTTP %d" % status_code
			return "Glosc One 返回 HTTP %d" % status_code

func _request_result_message(result_code: int) -> String:
	match result_code:
		HTTPRequest.RESULT_TIMEOUT:
			return "请求超时"
		HTTPRequest.RESULT_CANT_CONNECT:
			return "无法连接服务"
		HTTPRequest.RESULT_CANT_RESOLVE:
			return "无法解析服务地址"
		HTTPRequest.RESULT_CONNECTION_ERROR:
			return "连接中断"
		HTTPRequest.RESULT_TLS_HANDSHAKE_ERROR:
			return "TLS 握手失败"
		_:
			return str(result_code)

func _glosc_status_result(request_id: String, ok: bool, message: String, data: Dictionary = {}, retryable: bool = false) -> Dictionary:
	var result := data.duplicate(true)
	result["request_id"] = request_id
	result["ok"] = ok
	result["status"] = "ok" if ok else "error"
	if ok:
		result["message"] = message
	else:
		result["error"] = message
	result["retryable"] = retryable
	result["checked_at"] = Time.get_datetime_string_from_system(false, true)
	return result

func _extract_numeric(data: Dictionary, keys: Array[String]) -> Variant:
	for key in keys:
		if not data.has(key):
			continue
		var value: Variant = data.get(key)
		if value is int or value is float:
			return value
		if value is String and (value as String).is_valid_float():
			return float(value)
	return null

func _build_messages(purpose: String, input: Dictionary) -> Array[Dictionary]:
	var content_policy := _content_policy_text(input)
	return [
		{
			"role": "system",
			"content": "你是 Evolvria 的叙事与世界模拟引擎。必须遵守已确认世界状态，不得覆盖玩家明确设定。必须返回合法 JSON，不要输出 JSON 以外的内容。必须遵守内容边界：%s" % content_policy
		},
		{
			"role": "user",
			"content": JSON.stringify({
				"purpose": purpose,
				"input": input,
				"content_policy": content_policy,
				"output_schema": _schema_for(purpose)
			})
		}
	]

func _estimate_tokens(purpose: String, input: Dictionary) -> Dictionary:
	var serialized := JSON.stringify(input)
	var input_tokens := int(ceil(float(serialized.length()) / 3.6))
	var output_tokens := 280
	match purpose:
		"world_expand":
			input_tokens += 360
			output_tokens = 900
		"player_action":
			input_tokens += 220
			output_tokens = 360
		"npc_simulation":
			input_tokens += 160
			output_tokens = 180
		"memory_extract":
			input_tokens += 130
			output_tokens = 140
		"summary_update":
			input_tokens += 180
			output_tokens = 220
		"consistency_check":
			input_tokens += 140
			output_tokens = 120
		_:
			input_tokens += 180
	return {
		"input_tokens": maxi(120, input_tokens),
		"output_tokens": output_tokens
	}

func _estimate_risk_reasons(purpose: String, input: Dictionary, remote_enabled: bool) -> Array[String]:
	var reasons: Array[String] = []
	if remote_enabled:
		reasons.append("会发送必要世界上下文到 Glosc One")
	else:
		reasons.append("使用本地模拟，结果质量低于远端模型")
	if purpose == "world_expand":
		reasons.append("会生成初始地点、势力和开局事件")
	elif purpose == "player_action":
		reasons.append("成功后会写入时间线、记忆和状态补丁")
	elif purpose == "npc_simulation":
		reasons.append("可能推进 NPC 位置和世界事件")
	elif purpose == "memory_extract":
		reasons.append("只从已发生事件抽取事实和记忆，不生成新剧情")
	elif purpose == "summary_update":
		reasons.append("只压缩已发生事件，不引入新事实")
	elif purpose == "consistency_check":
		reasons.append("只检查引用和冲突，不会修改世界状态")
	if str(SettingsStore.get_value("log_level", "debug")) == "deep":
		reasons.append("deep 日志会保存脱敏原始响应")
	var content_text := JSON.stringify(input).to_lower()
	if content_text.contains("secret") or content_text.contains("token") or content_text.contains("密钥") or content_text.contains("密码"):
		reasons.append("输入可能包含敏感词，请确认后再发送")
	return reasons

func _purpose_label(purpose: String) -> String:
	match purpose:
		"world_expand":
			return "世界扩写"
		"player_action":
			return "玩家行动判定"
		"npc_simulation":
			return "NPC 自主行动"
		"memory_extract":
			return "记忆抽取"
		"summary_update":
			return "阶段摘要更新"
		"consistency_check":
			return "一致性检查"
		_:
			return purpose

func _content_policy_text(input: Dictionary) -> String:
	var limits: Array[String] = []
	var context: Dictionary = input.get("context", {}) if input.get("context", {}) is Dictionary else {}
	for item in context.get("content_limits", []):
		_append_unique_policy(limits, str(item))
	var seed: Dictionary = input.get("seed", {}) if input.get("seed", {}) is Dictionary else {}
	var seed_limits: Variant = seed.get("limits", [])
	if seed_limits is Array:
		for item in seed_limits:
			_append_unique_policy(limits, str(item))
	else:
		_append_unique_policy(limits, str(seed_limits))
	_append_unique_policy(limits, str(SettingsStore.get_value("content_preferences", "")))
	if limits.is_empty():
		return "避免生成违法或明显有害内容；尊重玩家明确设定；敏感内容使用淡出或替代叙事。"
	return "；".join(limits)

func _append_unique_policy(items: Array[String], value: String) -> void:
	var normalized := value.strip_edges()
	if normalized.is_empty() or normalized in items:
		return
	items.append(normalized)

func _schema_for(purpose: String) -> Dictionary:
	match purpose:
		"world_expand":
			return {"summary": "string", "rules": "array", "themes": "array", "locations": "array", "opening_event": "object"}
		"npc_simulation":
			return {"type": "npc_action", "title": "string", "description": "string", "character_id": "string", "new_location_id": "string", "importance": "number"}
		"memory_extract":
			return {"facts": "array", "memories": "array", "unresolved_threads": "array", "contradictions": "array"}
		"summary_update":
			return {"world_phase_summary": "string", "character_summaries": "array", "location_summaries": "array", "unresolved_threads": "array", "consistency_constraints": "array"}
		"consistency_check":
			return {"facts": "array", "memories": "array", "unresolved_threads": "array", "contradictions": "array"}
		_:
			return {"narrative": "string", "time_delta_hours": "number", "event_title": "string", "event_type": "player_action", "patches": "array", "suggested_actions": "array", "memory_text": "string"}
