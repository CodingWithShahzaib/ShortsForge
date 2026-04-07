"use client";

import { Bookmark, Download, Save, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TemplatePreset } from "@/lib/types";

type Props = {
  templates: TemplatePreset[];
  selectedTemplateId: string;
  onSelectedTemplateIdChange: (value: string) => void;
  saveName: string;
  onSaveNameChange: (value: string) => void;
  saveDescription: string;
  onSaveDescriptionChange: (value: string) => void;
  onApplySelected: () => void;
  onSaveCurrent: () => void;
  onDeleteSelected: () => void;
  saving: boolean;
  deleting: boolean;
  loading: boolean;
};

export function GenerateTemplatesCard({
  templates,
  selectedTemplateId,
  onSelectedTemplateIdChange,
  saveName,
  onSaveNameChange,
  saveDescription,
  onSaveDescriptionChange,
  onApplySelected,
  onSaveCurrent,
  onDeleteSelected,
  saving,
  deleting,
  loading,
}: Props) {
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || null;

  return (
    <div className="grid h-full gap-4 2xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <div className="flex h-full flex-col rounded-2xl bg-background/35 p-4 ring-1 ring-border/30">
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Load a preset</p>
            <p className="mt-1 text-sm font-semibold">Reuse a saved setup</p>
            <p className="text-xs text-muted-foreground">
              Load a built-in or custom template to restore generation settings in one step.
            </p>
          </div>

          <Field id="generate-template-select" label="Saved templates">
            <Select value={selectedTemplateId} onValueChange={onSelectedTemplateIdChange}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? "Loading templates..." : "Select template"} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {selectedTemplate ? (
            <div className="rounded-xl bg-background/55 p-3 ring-1 ring-border/20">
              <div className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">{selectedTemplate.name}</p>
              </div>
              {selectedTemplate.description ? (
                <p className="mt-1 text-xs text-muted-foreground">{selectedTemplate.description}</p>
              ) : null}
              <p className="mt-2 text-[11px] text-muted-foreground">
                {selectedTemplate.builtin ? "Built-in template" : "Custom template"} • {selectedTemplate.story_type} • {selectedTemplate.scene_count} scenes
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-border/30 pt-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onApplySelected}
            disabled={!selectedTemplateId || loading}
          >
            <Download className="h-4 w-4" />
            Apply
          </Button>
          {!selectedTemplate?.builtin ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onDeleteSelected}
              disabled={!selectedTemplateId || deleting}
              loading={deleting}
              loadingLabel="Deleting..."
              aria-label={selectedTemplate ? `Delete ${selectedTemplate.name}` : "Delete custom template"}
              title={selectedTemplate ? `Delete ${selectedTemplate.name}` : "Delete custom template"}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex h-full flex-col rounded-2xl bg-background/35 p-4 ring-1 ring-border/30">
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Capture current setup</p>
            <p className="mt-1 text-sm font-semibold">Save exact current state</p>
            <p className="text-xs text-muted-foreground">
              Stores the current generate-page configuration, including dialogue settings, characters, content source, and script.
            </p>
          </div>

          <Field id="generate-template-name" label="Template name" required>
            <Input
              value={saveName}
              onChange={(event) => onSaveNameChange(event.target.value)}
              placeholder="Example: Debate comic preset"
            />
          </Field>

          <Field id="generate-template-description" label="Description">
            <Textarea
              value={saveDescription}
              onChange={(event) => onSaveDescriptionChange(event.target.value)}
              rows={3}
              placeholder="Optional note about when to reuse this setup"
            />
          </Field>
        </div>

        <div className="mt-4 border-t border-border/30 pt-4">
          <Button
            type="button"
            className="w-full"
            onClick={onSaveCurrent}
            disabled={!saveName.trim()}
            loading={saving}
            loadingLabel="Saving..."
          >
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
