import { useEffect, useMemo, useState } from "react";
import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";
import { generateClient } from "aws-amplify/data";
import { uploadData, getUrl, remove } from "aws-amplify/storage";
import { signOut, getCurrentUser } from "aws-amplify/auth";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import "./App.css";

Amplify.configure(outputs);

function App() {
  const client = useMemo(() => generateClient(), []);

  const [notes, setNotes] = useState([]);
  const [formData, setFormData] = useState({ name: "", description: "", imageFile: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  async function fetchNotes() {
    const { data } = await client.models.Note.list();
    // Attach signed image URLs when present
    const withUrls = await Promise.all(
      data.map(async (note) => {
        if (note.image) {
          try {
            const urlResult = await getUrl({ path: note.image });
            return { ...note, imageUrl: urlResult.url.toString() };
          } catch {
            return note;
          }
        }
        return note;
      })
    );
    setNotes(withUrls);
  }

  useEffect(() => {
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onChangeField(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function onSelectImage(e) {
    const file = e.target.files && e.target.files[0];
    if (file) {
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      setFormData((prev) => ({ ...prev, imageFile: file }));
      
      // Start upload process
      setIsUploading(true);
      setUploadProgress(0);
      
      try {
        const key = `${Date.now()}_${file.name}`;
        const uploadResult = await uploadData({
          path: ({ identityId }) => `media/${identityId}/${key}`,
          data: file,
        }).result;
        
        setUploadProgress(100);
        setFormData((prev) => ({ ...prev, imagePath: uploadResult.path }));
      } catch (error) {
        console.error('Upload failed:', error);
        setImagePreview(null);
        setFormData((prev) => ({ ...prev, imageFile: null, imagePath: null }));
      } finally {
        setIsUploading(false);
      }
    } else {
      setImagePreview(null);
      setFormData((prev) => ({ ...prev, imageFile: null, imagePath: null }));
    }
  }

  async function createNote(e) {
    e.preventDefault();
    if (!formData.name && !formData.description) return;
    setIsSubmitting(true);
    try {
      // Get current user to set owner field
      const { username } = await getCurrentUser();
      
      const { data: newNote } = await client.models.Note.create({
        name: formData.name || undefined,
        description: formData.description || undefined,
        image: formData.imagePath || undefined,
        owner: username,
      });

      // If we created with an image, resolve a display URL
      let imageUrl;
      if (newNote.image) {
        try {
          const url = await getUrl({ path: newNote.image });
          imageUrl = url.url.toString();
        } catch {}
      }

      setNotes((prev) => [{ ...newNote, imageUrl }, ...prev]);
      setFormData({ name: "", description: "", imageFile: null, imagePath: null });
      setImagePreview(null);
      setUploadProgress(0);
    } finally {
      setIsSubmitting(false);
    }
  }

  function removeImage() {
    setImagePreview(null);
    setFormData((prev) => ({ ...prev, imageFile: null, imagePath: null }));
    setUploadProgress(0);
    // Reset file input
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) fileInput.value = '';
  }

  async function deleteNote(note) {
    await client.models.Note.delete({ id: note.id });
    // Best-effort delete stored image
    if (note.image) {
      try {
        await remove({ path: note.image });
      } catch {}
    }
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
  }

  return (
    <Authenticator>
      {() => (
        <>
          <header className="app-header">
            <div className="header-content">
              <h1 className="app-title">Amplify Notes</h1>
              <button 
                onClick={handleSignOut}
                className="btn btn-danger btn-sm"
              >
                Sign Out
              </button>
            </div>
          </header>
          
          <main className="app-main">

            <form onSubmit={createNote} className="note-form">
              <div className="form-group">
                <label className="form-label" htmlFor="note-name">Note Title</label>
                <input
                  id="note-name"
                  name="name"
                  className="form-input"
                  placeholder="Enter a title for your note..."
                  value={formData.name}
                  onChange={onChangeField}
                />
              </div>
              
              <div className="form-group">
                <label className="form-label" htmlFor="note-description">Description</label>
                <textarea
                  id="note-description"
                  name="description"
                  className="form-input form-textarea"
                  placeholder="Write your note description here..."
                  value={formData.description}
                  onChange={onChangeField}
                  rows={4}
                />
              </div>
              
              {/* Image Upload Section */}
              <div className="form-group">
                <label className="form-label">Image (optional)</label>
                <div className={`image-upload-section ${imagePreview ? 'has-image' : ''}`}>
                  {!imagePreview ? (
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={onSelectImage}
                      className="form-input"
                    />
                  ) : (
                    <div>
                      <div className="image-preview">
                        <img 
                          src={imagePreview} 
                          alt="Preview" 
                        />
                      </div>
                      
                      {isUploading ? (
                        <div className="upload-progress">
                          <div className="progress-bar">
                            <div 
                              className="progress-fill"
                              style={{ width: `${uploadProgress}%` }}
                            ></div>
                          </div>
                          <div className={`upload-status uploading`}>
                            {uploadProgress < 100 ? "Uploading..." : "Upload complete!"}
                          </div>
                        </div>
                      ) : (
                        <div className="upload-progress">
                          <div className={`upload-status success`}>
                            ✓ Image uploaded successfully
                          </div>
                        </div>
                      )}
                      
                      <div className="image-actions">
                        <button 
                          type="button" 
                          onClick={removeImage}
                          className="btn btn-danger btn-sm"
                        >
                          Remove Image
                        </button>
                        <label className="btn btn-secondary btn-sm">
                          Change Image
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={onSelectImage}
                            style={{ display: "none" }}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={isSubmitting || isUploading}
              >
                {isSubmitting ? "Creating..." : isUploading ? "Uploading..." : "Create Note"}
              </button>
            </form>

            {notes.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📝</div>
                <h3 className="empty-state-title">No notes yet</h3>
                <p className="empty-state-description">
                  Create your first note using the form above to get started!
                </p>
              </div>
            ) : (
              <ul className="notes-list">
                {notes.map((note) => (
                  <li key={note.id} className="note-card fade-in">
                    <div className="note-header">
                      <div className="note-content">
                        {note.name && (
                          <h3 className="note-title">{note.name}</h3>
                        )}
                        {note.description && (
                          <p className="note-description">{note.description}</p>
                        )}
                      </div>
                      <button 
                        onClick={() => deleteNote(note)}
                        className="btn btn-danger btn-sm"
                      >
                        Delete
                      </button>
                    </div>
                    {note.imageUrl && (
                      <div className="note-image">
                        <img
                          src={note.imageUrl}
                          alt={note.name || "note image"}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </main>
        </>
      )}
    </Authenticator>
  );
}

export default App;