extends Node

signal ai_request_started(request_id: String, purpose: String)
signal ai_request_finished(request_id: String, result: Dictionary)
signal ai_request_failed(request_id: String, error: String)
signal ai_confirmation_requested(request_id: String, purpose: String, summary: String)

var _request_counter: int = 0
var pending_confirmation: Dictionary = {}
var _active_requests: Dictionary = {}

func _next_request_id() -> String:
	_request_counter += 1
	return "ai_req_%04d" % _request_counter

func generate_world(seed: Dictionary) -> Dictionary:
	var request_id := _next_request_id()
	if not await _confirm_if_needed(request_id, "world_expand", "生成完整世界观、地点、关键角色补全和开局事件。"):
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
	if not await _confirm_if_needed(request_id, "player_action", "处理玩家行动：%s" % action.left(40)):
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
	if lowered.contains("调查") or lowered.contains("查看") or lowered.contains("询问"):
		outcome = "success"
		tone = "你的谨慎带来回报，几个零散细节被串联起来。"
	elif lowered.contains("攻击") or lowered.contains("强行") or lowered.contains("威胁"):
		outcome = "cost"
		tone = "行动产生了效果，但也让旁观者记住了你的做法。"
	elif lowered.contains("等待") or lowered.contains("休息"):
		outcome = "quiet"
		tone = "时间流过，世界并没有停下脚步。"

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

func create_npc_event(character: Dictionary, snapshot: Dictionary) -> Dictionary:
	if SettingsStore.is_glosc_configured():
		var request_id := _next_request_id()
		if not await _confirm_if_needed(request_id, "npc_simulation", "推进 NPC 自主行动：%s" % character.get("name", "未知角色")):
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
	if str(character.get("role", "")).contains("敌") or str(character.get("relationship", "")).contains("敌"):
		verb = "布置试探"
	elif str(character.get("traits", [])).contains("谨慎"):
		verb = "收集情报"

	return {
		"type": "npc_action",
		"title": "%s%s" % [character_name, verb],
		"description": "%s离开原本的位置，前往%s%s。这个变化暂时只留下简短记录。" % [character_name, str(target.get("name", "某地")), verb],
		"character_id": str(character.get("id", "")),
		"new_location_id": target_id,
		"importance": 0.35,
		"status": "ok",
		"usage": {"input_tokens": 90, "output_tokens": 80, "cost": null}
	}

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
	var http: HTTPRequest = data.get("http", null)
	if http != null:
		http.cancel_request()
	_active_requests[request_id] = data

func confirm_pending_request() -> void:
	if pending_confirmation.is_empty():
		return
	pending_confirmation["confirmed"] = true

func cancel_pending_request() -> void:
	if pending_confirmation.is_empty():
		return
	pending_confirmation["cancelled"] = true

func _confirm_if_needed(request_id: String, purpose: String, summary: String) -> bool:
	if not bool(SettingsStore.get_value("confirm_ai_calls", true)):
		return true
	pending_confirmation = {
		"request_id": request_id,
		"purpose": purpose,
		"summary": summary,
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
		"model": str(SettingsStore.get_value("model", "glosc-one-default")),
		"messages": _build_messages(purpose, input),
		"response_format": "json",
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
	var http := HTTPRequest.new()
	http.timeout = float(SettingsStore.get_value("timeout_seconds", 45))
	add_child(http)
	var headers := [
		"Content-Type: application/json",
		"Authorization: Bearer %s" % str(SettingsStore.get_value("glosc_token", ""))
	]
	var endpoint := _resolve_glosc_endpoint()
	if endpoint.is_empty():
		http.queue_free()
		return {"request_id": request_id, "status": "error", "error": "Glosc One 服务地址为空。", "retryable": false}
	_active_requests[request_id] = {"http": http, "cancelled": false, "purpose": purpose, "attempt": attempt}
	var err := http.request(endpoint, headers, HTTPClient.METHOD_POST, JSON.stringify(payload))
	if err != OK:
		http.queue_free()
		_active_requests.erase(request_id)
		return {"request_id": request_id, "status": "error", "error": "无法发起 Glosc One 请求：%s" % error_string(err)}
	var completed := false
	var response: Array = []
	http.request_completed.connect(func(result: int, response_code: int, response_headers: PackedStringArray, body: PackedByteArray) -> void:
		response = [result, response_code, response_headers, body]
		completed = true
	)
	while not completed:
		if _is_request_cancelled(request_id):
			http.cancel_request()
			http.queue_free()
			_active_requests.erase(request_id)
			return {"request_id": request_id, "status": "cancelled", "error": "AI 调用已取消。", "purpose": purpose, "retryable": false}
		await get_tree().process_frame
	http.queue_free()
	_active_requests.erase(request_id)
	var result_code := int(response[0])
	var status_code := int(response[1])
	var body := response[3] as PackedByteArray
	if result_code != HTTPRequest.RESULT_SUCCESS:
		return {"request_id": request_id, "status": "error", "error": "Glosc One 网络请求失败：%s" % _request_result_message(result_code), "retryable": true}
	if status_code < 200 or status_code >= 300:
		return {"request_id": request_id, "status": "error", "error": _http_error_message(status_code), "http_status": status_code, "retryable": _is_retryable_status(status_code)}
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if not parsed is Dictionary:
		return {"request_id": request_id, "status": "error", "error": "Glosc One 响应不是合法 JSON。", "retryable": false}
	var data := parsed as Dictionary
	if data.has("content") and data.get("content") is Dictionary:
		var content := data.get("content") as Dictionary
		content["request_id"] = str(data.get("request_id", request_id))
		content["status"] = str(data.get("status", content.get("status", "ok")))
		content["usage"] = data.get("usage", content.get("usage", {}))
		content["attempt"] = attempt
		return content
	data["request_id"] = str(data.get("request_id", request_id))
	data["status"] = str(data.get("status", "ok"))
	data["attempt"] = attempt
	return data

func _resolve_glosc_endpoint() -> String:
	var endpoint := str(SettingsStore.get_value("glosc_base_url", "")).strip_edges()
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
	return endpoint

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

func _build_messages(purpose: String, input: Dictionary) -> Array[Dictionary]:
	return [
		{
			"role": "system",
			"content": "你是 Evolvria 的叙事与世界模拟引擎。必须遵守已确认世界状态，不得覆盖玩家明确设定。必须返回合法 JSON，不要输出 JSON 以外的内容。"
		},
		{
			"role": "user",
			"content": JSON.stringify({
				"purpose": purpose,
				"input": input,
				"output_schema": _schema_for(purpose)
			})
		}
	]

func _schema_for(purpose: String) -> Dictionary:
	match purpose:
		"world_expand":
			return {"summary": "string", "rules": "array", "themes": "array", "locations": "array", "opening_event": "object"}
		"npc_simulation":
			return {"type": "npc_action", "title": "string", "description": "string", "character_id": "string", "new_location_id": "string", "importance": "number"}
		_:
			return {"narrative": "string", "time_delta_hours": "number", "event_title": "string", "event_type": "player_action", "patches": "array", "suggested_actions": "array", "memory_text": "string"}
