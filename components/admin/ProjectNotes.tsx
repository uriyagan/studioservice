"use client";

import { NotesPanel, type NotesActions } from "@/components/admin/NotesPanel";
import {
  getProjectNotes,
  createProjectNote,
  updateProjectNote,
  deleteProjectNote,
  addNoteFile,
  deleteNoteFile,
} from "@/app/actions/project-notes";

export function ProjectNotes({ projectId }: { projectId: string }) {
  const actions: NotesActions = {
    list: () => getProjectNotes(projectId),
    create: (body, files) => createProjectNote(projectId, body, files),
    update: updateProjectNote,
    remove: deleteProjectNote,
    addFile: (id, path, name) => addNoteFile({ noteId: id, path, fileName: name }),
    removeFile: deleteNoteFile,
  };
  return <NotesPanel actions={actions} />;
}
