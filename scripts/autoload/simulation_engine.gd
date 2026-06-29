extends Node

func advance_world(snapshot: Dictionary, max_events: int = 2) -> Array[Dictionary]:
	var generated: Array[Dictionary] = []
	var characters: Array = snapshot.get("characters", [])
	for character in characters:
		if generated.size() >= max_events:
			break
		var data := character as Dictionary
		if str(data.get("role", "")) == "player":
			continue
		if bool(data.get("is_companion", false)):
			continue
		if str(data.get("status", "active")) in ["dead", "left", "missing", "inactive"]:
			continue
		if randf() < 0.55:
			var event := await AIService.create_npc_event(data, snapshot)
			if not event.is_empty():
				generated.append(event)
	return generated
