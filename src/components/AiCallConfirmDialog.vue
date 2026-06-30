<script setup lang="ts">
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description: string;
    estimateText: string;
    confirmLabel?: string;
    cancelLabel?: string;
    busy?: boolean;
  }>(),
  {
    confirmLabel: "确认调用",
    cancelLabel: "取消",
    busy: false,
  },
);

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

function handleOpenChange(value: boolean) {
  if (!value) emit("cancel");
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>

      <Alert>
        <AlertTitle>用量估算</AlertTitle>
        <AlertDescription>{{ estimateText }}</AlertDescription>
      </Alert>

      <DialogFooter>
        <Button variant="outline" :disabled="busy" type="button" @click="emit('cancel')">{{ cancelLabel }}</Button>
        <Button :disabled="busy" type="button" @click="emit('confirm')">
          <Spinner v-if="busy" data-icon="inline-start" />
          {{ busy ? "正在调用..." : confirmLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
